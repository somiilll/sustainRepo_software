/**
 * Step 3: Year & Monthly Data Component
 * Handles reporting year selection, frequency, and data entry
 * This is the largest step component (~1000 lines extracted)
 * 
 * NOTE: Due to the extreme complexity and tight coupling with parent state,
 * this component receives all necessary data via props and renders the JSX.
 * The parent (EmissionEntryForm) manages all state and callbacks.
 */

import React from 'react';
import { Label } from '../../../../../../components/ui/label';
import { Input } from '../../../../../../components/ui/input';
import { Button } from '../../../../../../components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../../../../components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../../../components/ui/tooltip';
import { Info, Check, Upload, Eye, Download, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Import CustomFuelMonthFields for per-month custom fuel inputs
import CustomFuelMonthFields from '../CustomFuelMonthFields';

// Import MultiEmployeeInput for C7
import MultiEmployeeInput from '../../../../../../components/MultiEmployeeInput';

// Import month constants
import { MONTHS } from '../../../../../../constants/months';

// Static help text shown next to specific dynamic field labels. Keyed by
// `field.variable` so it matches regardless of how the label is worded.
const FIELD_HELP = {
  inflation_rate:
    'Adjusts values to match the EF publication year. If left empty, system defaults will apply. Enter 1 to turn off inflation adjustment.',
  ppp:
    'Accounts for country-specific purchasing power differences. If left empty, system defaults will be used. To disable this adjustment, input the USD/INR exchange rate for the reporting period.',
};

// Import volume unit helper
import { isVolumeUnit } from '../../../../../../utils/helpers/unit-utils';

/**
 * Step 3 Year & Monthly Data Component
 * 
 * This component handles:
 * - Reporting year type selection (calendar/financial)
 * - Year selection
 * - Frequency type selection (monthly/yearly)
 * - Multi-employee input for C7 Employee Commuting
 * - Monthly accordion data entry
 * - Yearly data entry
 * - Evidence uploads
 * - Override options
 */
export const Step3YearMonthlyData = ({
  // Reporting period props
  reportingYearType,
  setReportingYearType,
  hasOrgYearTypePreference,
  reportingYear,
  setReportingYear,
  frequencyType,
  setFrequencyType,
  editingEmission,
  setMonthlyData,
  setYearlyData,
  setExpandedMonths,
  
  // Monthly data props
  activeMonths,
  monthlyData,
  expandedMonths,
  
  // Yearly data props
  yearlyData,
  
  // Dynamic fields
  dynamicInputFields,
  formConfig,
  loadingFormConfig,
  
  // Helpers
  getMonthStatus,
  filledMonthsCount,
  updateMonthData,
  getActualYearForMonth,
  isFutureMonth,
  getFieldUnitsForYearly,
  renderDynamicField,
  
  // Employee commuting (C7)
  isC7EmployeeCommuting,
  scope3Method,
  scope3ActivityType,
  scope3ActivityId,
  employees,
  setEmployees,
  employeeMonthlyTotals,
  employeeYearlyTotal,
  isCalculatingEmployee,
  handleCalculateEmployeeMonth,
  filteredScope3Activities,
  useCustomActivity,
  scope3CustomActivity,
  
  // Process emissions
  isProcessEmissions,
  selectedTemplate,
  
  // Override/fuel props
  scope,
  biogenicScopeSelection,
  useCustomFuel,
  selectedFuel,
  centralizedUnits,
  defaultUnit,
  allowedUnits,
  customEmissionFactorUnit,
  customFuelQtyUnit,
  calculationMethodology,
  getQuantityUnitFromEFUnit,
  
  // Evidence handling
  handleEvidenceUpload,
  removeEvidence,
  
  // Backend URL for file viewing
  BACKEND_URL,
}) => {
  return (
    <div className="space-y-4">
      {/* Note about yearly aggregation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Each emission entry record is for <strong>1 year only</strong>. 
          Monthly data entered below will be aggregated for the selected reporting year.
        </p>
      </div>

      {/* Reporting Year Type, Year Selection, Data Entry Frequency - All in one row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Reporting Year Type Selection */}
        <div>
          <Label className="mb-2 block">Reporting Year Type <span className="text-red-500">*</span></Label>
          {!hasOrgYearTypePreference ? (
            <select
              value={reportingYearType}
              onChange={(e) => {
                setReportingYearType(e.target.value);
                setMonthlyData({});
              }}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="reporting-year-type-select"
            >
              <option value="calendar">Calendar Year (Jan-Dec)</option>
              <option value="financial">Financial Year (Apr-Mar)</option>
            </select>
          ) : (
            <div className="w-full h-10 flex items-center px-3 rounded-lg bg-stone-50 border border-stone-200">
              <span className="text-sm">
                {reportingYearType === 'financial' ? 'Financial Year' : 'Calendar Year'}
              </span>
              <span className="ml-2 text-xs text-text-muted">(From Org Settings)</span>
            </div>
          )}
        </div>

        {/* Year Selection */}
        <div>
          <Label className="mb-2 block">
            {reportingYearType === 'financial' ? 'Financial Year' : 'Reporting Year'} <span className="text-red-500">*</span>
          </Label>
          <select
            value={reportingYear}
            onChange={(e) => {
              setReportingYear(e.target.value);
              setMonthlyData({});
            }}
            className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="reporting-year-select"
          >
            {Array.from({ length: 6 }, (_, i) => {
              const year = new Date().getFullYear() - i;
              return (
                <option key={year} value={year}>
                  {reportingYearType === 'financial' 
                    ? `FY ${year}-${(year + 1).toString().slice(-2)}` 
                    : year}
                </option>
              );
            })}
          </select>
        </div>

        {/* Data Entry Frequency Selection */}
        <div>
          <Label className="mb-2 block">Data Entry Frequency <span className="text-red-500">*</span></Label>
          <select
            value={frequencyType}
            onChange={(e) => {
              const newFreq = e.target.value;
              setFrequencyType(newFreq);
              if (newFreq === 'monthly') {
                setYearlyData({});
              } else {
                setMonthlyData({});
                setExpandedMonths([]);
              }
            }}
            disabled={!!editingEmission}
            className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${editingEmission ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="frequency-type-select"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly (Annual Total)</option>
          </select>
          {editingEmission && (
            <p className="text-xs text-amber-600 mt-1">Locked when editing</p>
          )}
        </div>
      </div>

      {/* Show badge indicating frequency type */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          frequencyType === 'yearly' 
            ? 'bg-purple-100 text-purple-700' 
            : 'bg-blue-100 text-blue-700'
        }`}>
          {frequencyType === 'yearly' ? 'Annual Entry' : 'Monthly Entry'}
        </span>
        <span className="text-sm text-stone-600">
          {reportingYearType === 'financial' 
            ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
            : `CY${reportingYear}`}
        </span>
      </div>

      {/* Multi-Employee Input for C7 Employee Commuting */}
      {isC7EmployeeCommuting && (
        <>
          {/* Supplier Method Disclaimer for C7 */}
          {scope3Method === 'supplier_basis' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the "Quantity Used" field.
              </p>
            </div>
          )}
          
          <MultiEmployeeInput
            entityLabel="Employee"
            fields={dynamicInputFields.map(f => ({
              variable: f.variable,
              label: f.label,
              type: f.fieldType,
              unit: f.expectedUnit || f.unit || '',
              required: f.required,
              placeholder: f.placeholder,
            }))}
            selectedActivityType={scope3ActivityType}
            calculationMethod={scope3Method}
            employees={employees}
            onEmployeesChange={setEmployees}
            activeMonths={activeMonths.map(m => {
              const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthNum = parseInt(m.key);
              return monthKeys[monthNum - 1] || m.key;
            })}
            onCalculateEmployee={handleCalculateEmployeeMonth}
            monthlyTotals={employeeMonthlyTotals}
            yearlyTotal={employeeYearlyTotal}
            isCalculating={isCalculatingEmployee}
            disabled={!scope3Method || !scope3ActivityType}
            reportingYear={reportingYear}
            reportingYearType={reportingYearType}
            frequencyType={frequencyType}
            isFutureMonth={(monthKey) => {
              const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthIndex = monthKeys.indexOf(monthKey.toLowerCase());
              if (monthIndex === -1) return false;
              const monthNum = String(monthIndex + 1).padStart(2, '0');
              return isFutureMonth(monthNum, reportingYear, reportingYearType);
            }}
            emissionFactorInfo={(() => {
              const matchedActivity = scope3ActivityId 
                ? filteredScope3Activities.find(a => a.id === scope3ActivityId)
                : filteredScope3Activities[0];
              
              if (!matchedActivity && !scope3ActivityType) return null;
              
              let formula = '';
              const activityLabel = matchedActivity?.activity || scope3ActivityType?.replace(/_/g, ' ') || 'Activity';
              
              if (scope3Method === 'supplier_basis') {
                formula = `CO₂e = ${dynamicInputFields.map(f => f.label || f.variable).join(' × ')} × Supplier EF`;
              } else if (scope3Method === 'activity_basis') {
                const inputLabels = dynamicInputFields
                  .filter(f => !f.isOverride && f.required !== false)
                  .map(f => f.label || f.variable);
                
                if (inputLabels.length > 0) {
                  formula = `CO₂e = ${inputLabels.join(' × ')} × EF`;
                } else {
                  formula = `CO₂e = Distance × Working Days × EF`;
                }
              } else {
                formula = 'CO₂e = Activity × Emission Factor';
              }
              
              return {
                emissionFactor: matchedActivity?.emission_factor,
                efUnit: matchedActivity?.ef_unit,
                source: matchedActivity?.source || 'DEFRA 2023',
                formula: formula,
                activityType: activityLabel,
              };
            })()}
            showEmissionFactorCard={false}
          />
        </>
      )}

      {/* Monthly Data Entry - Hidden when C7 Employee Commuting */}
      {!isC7EmployeeCommuting && frequencyType === 'monthly' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Monthly Data for {reportingYearType === 'financial' 
                ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}` 
                : reportingYear}
            </Label>
            <span className="text-sm text-stone-500">
              {filledMonthsCount} / 12 months filled
            </span>
          </div>

          {/* Supplier Method Disclaimer - shown once at top */}
          {scope3Method === 'supplier_basis' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the "Quantity Used" field.
              </p>
            </div>
          )}

          <Accordion type="multiple" value={expandedMonths} onValueChange={setExpandedMonths}>
            {activeMonths.map(month => {
              const monthKey = month.key;
              const status = getMonthStatus(monthKey);
              const data = monthlyData[monthKey] || {};
              const isDisabled = isFutureMonth(monthKey, reportingYear, reportingYearType);
              const displayYear = getActualYearForMonth(monthKey);

              return (
                <AccordionItem 
                  key={monthKey} 
                  value={monthKey} 
                  className={`border rounded-lg mb-2 ${isDisabled ? 'opacity-50' : ''}`}
                  disabled={isDisabled}
                >
                  <AccordionTrigger 
                    className={`px-4 py-3 hover:no-underline ${isDisabled ? 'cursor-not-allowed' : ''}`}
                    disabled={isDisabled}
                  >
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          isDisabled ? 'bg-stone-200' :
                          status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                        }`} />
                        <span className={`font-medium ${isDisabled ? 'text-stone-400' : ''}`}>
                          {month.name} {displayYear}
                          {isDisabled && <span className="ml-2 text-xs text-stone-400">(Future)</span>}
                        </span>
                      </div>
                      {status === 'filled' && !isDisabled && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <Check className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  {!isDisabled && (
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4">
                      {/* For Process Emissions: Show template required input field with fixed unit */}
                      {isProcessEmissions && selectedTemplate ? (
                        <div className="space-y-4">
                          {selectedTemplate.input_fields?.map((field) => (
                            <div key={field.key} className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>{field.label} {!field.is_optional && '*'}</Label>
                                <Input
                                  type={field.data_type === 'number' ? 'number' : 'text'}
                                  step={field.data_type === 'number' ? 'any' : undefined}
                                  min="0"
                                  placeholder={`Enter ${field.label.toLowerCase()}`}
                                  value={data[field.key] || ''}
                                  onChange={(e) => updateMonthData(monthKey, field.key, e.target.value)}
                                  className="bg-stone-50"
                                  data-testid={`month-${monthKey}-${field.key}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Unit</Label>
                                <select
                                  value={data[`${field.key}_unit`] || field.unit || 'kg'}
                                  onChange={(e) => updateMonthData(monthKey, `${field.key}_unit`, e.target.value)}
                                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                  data-testid={`month-${monthKey}-${field.key}-unit`}
                                >
                                  {['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3'].map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : formConfig && dynamicInputFields.length > 0 ? (
                        /* Dynamic Fields from ce_input_field_mappings */
                        <div className="space-y-6">
                          {/* Required Inputs Section */}
                          {dynamicInputFields.filter(f => f.required && !f.isOverride).length > 0 && (
                            <div className="space-y-6">
                              {dynamicInputFields.filter(f => f.required && !f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                            </div>
                          )}
                          
                          {/* Override Properties Section */}
                          {dynamicInputFields.filter(f => f.isOverride).length > 0 && (
                            <div className="space-y-6">
                              {dynamicInputFields.filter(f => f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                            </div>
                          )}
                          
                          {/* Optional Inputs Section */}
                          {dynamicInputFields.filter(f => !f.required && !f.isOverride).length > 0 && (
                            <div className="space-y-6">
                              {dynamicInputFields.filter(f => !f.required && !f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                            </div>
                          )}
                          
                          {/* Loading indicator */}
                          {loadingFormConfig && (
                            <div className="flex items-center gap-2 text-sm text-stone-500 p-3 bg-stone-100 rounded-lg">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading form fields...
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Fallback: Simple Quantity and Unit (legacy) */
                        <div className="grid grid-cols-2 gap-4 items-end">
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Enter quantity"
                              value={data.quantity || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || parseFloat(val) >= 0) {
                                  updateMonthData(monthKey, 'quantity', val);
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
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
                      )}

                      {/* Per-month custom fuel fields (EF, CV, carbon content etc.) */}
                      {useCustomFuel && (
                        <CustomFuelMonthFields
                          monthKey={monthKey}
                          data={data}
                          updateMonthData={updateMonthData}
                          calculationMethodology={calculationMethodology}
                        />
                      )}

                      {/* Evidence Upload */}
                      <div className="space-y-2">
                        <Label>Evidence(s)</Label>
                        <div className="border-2 border-dashed border-stone-200 rounded-lg p-4">
                          <input
                            type="file"
                            id={`evidence-${monthKey}`}
                            className="hidden"
                            multiple
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              for (let i = 0; i < files.length; i++) {
                                await handleEvidenceUpload(monthKey, files[i]);
                              }
                              e.target.value = '';
                            }}
                            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx,.gif,.webp"
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
                            {data.evidences.map((evidence, idx) => {
                              const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                              const fileId = fileIdMatch ? fileIdMatch[1] : null;
                              const viewUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/view` : evidence.url;
                              const downloadUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/download` : evidence.url;
                              
                              return (
                                <div key={idx} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                                  <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <span className="text-sm text-green-700 truncate flex-1" title={evidence.filename}>
                                    {evidence.filename}
                                  </span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <a
                                      href={viewUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 px-2 py-1"
                                      title="View file"
                                    >
                                      <Eye className="w-3 h-3" />
                                      View
                                    </a>
                                    {fileId && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          window.open(downloadUrl, '_blank');
                                        }}
                                        className="text-xs text-green-600 hover:text-green-800 hover:underline flex items-center gap-1 px-2 py-1"
                                        title="Download file"
                                      >
                                        <Download className="w-3 h-3" />
                                        Download
                                      </button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeEvidence(monthKey, idx)}
                                      className="text-red-500 hover:text-red-700 p-1 h-auto"
                                      title="Remove file"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Override Options - Scope 1 and Biogenic (not for Fugitive Emissions) */}
                      {!formConfig && (scope === 'scope1' || scope === 'biogenic') && !useCustomFuel && selectedFuel && !category?.toLowerCase()?.includes('fugitive') && (
                        <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`override-cv-${monthKey}`}
                              checked={data.overrideCalorificValue || false}
                              onChange={(e) => updateMonthData(monthKey, 'overrideCalorificValue', e.target.checked)}
                            />
                            <label htmlFor={`override-cv-${monthKey}`} className="text-sm">
                              Calorific Value (if available) <span className="text-gray-500">({selectedFuel?.calorific_value_unit})</span>
                            </label>
                          </div>

                          {data.overrideCalorificValue && (
                            <div className="grid grid-cols-2 gap-2 ml-6">
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Enter value"
                                value={data.calorificValue || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) {
                                    updateMonthData(monthKey, 'calorificValue', val);
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                className="bg-white"
                                required
                              />
                              <Input
                                placeholder="Justifications/Comments *"
                                value={data.calorificValueJustification || ''}
                                onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)}
                                className="bg-white"
                                required
                              />
                            </div>
                          )}

                          {/* Only show Density option if volume unit is selected */}
                          {isVolumeUnit(data.unit || defaultUnit, centralizedUnits) && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`override-density-${monthKey}`}
                                  checked={data.overrideDensity || false}
                                  onChange={(e) => updateMonthData(monthKey, 'overrideDensity', e.target.checked)}
                                />
                                <label htmlFor={`override-density-${monthKey}`} className="text-sm">
                                  Density Value (if available) <span className="text-gray-500">({selectedFuel?.density_unit})</span>
                                </label>
                              </div>

                              {data.overrideDensity && (
                                <div className="grid grid-cols-2 gap-2 ml-6">
                                  <Input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder="Enter value"
                                    value={data.density || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || parseFloat(val) >= 0) {
                                        updateMonthData(monthKey, 'density', val);
                                      }
                                    }}
                                    onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                    className="bg-white"
                                    required
                                  />
                                  <Input
                                    placeholder="Justifications/Comments *"
                                    value={data.densityJustification || ''}
                                    onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)}
                                    className="bg-white"
                                    required
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Override Options - Scope 2 */}
                      {!formConfig && scope === 'scope2' && !useCustomFuel && (
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
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                              Unit: tCO₂/MWh
                            </span>
                          </div>

                          {data.useCustomEmissionFactor && (
                            <div className="space-y-2 ml-6">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-xs text-blue-700">Custom EF (tCO₂/MWh)</label>
                                  <Input
                                    type="number"
                                    step="any"
                                    placeholder="e.g., 0.5"
                                    value={data.customEmissionFactor || ''}
                                    onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)}
                                    className="bg-white"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs text-blue-700">Justification/Comments <span className="text-red-500">*</span></label>
                                  <Input
                                    placeholder="Justification/Comments"
                                    value={data.customEmissionFactorSource || ''}
                                    onChange={(e) => updateMonthData(monthKey, 'customEmissionFactorSource', e.target.value)}
                                    className="bg-white"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                  )}
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}

      {/* YEARLY Data Entry (non-C7) */}
      {!isC7EmployeeCommuting && frequencyType === 'yearly' && (
        <YearlyDataEntry
          reportingYearType={reportingYearType}
          reportingYear={reportingYear}
          isProcessEmissions={isProcessEmissions}
          selectedTemplate={selectedTemplate}
          formConfig={formConfig}
          dynamicInputFields={dynamicInputFields}
          yearlyData={yearlyData}
          setYearlyData={setYearlyData}
          scope3Method={scope3Method}
          getFieldUnitsForYearly={getFieldUnitsForYearly}
          centralizedUnits={centralizedUnits}
          defaultUnit={defaultUnit}
          isVolumeUnit={isVolumeUnit}
          useCustomFuel={useCustomFuel}
          calculationMethodology={calculationMethodology}
        />
      )}
    </div>
  );
};

/**
 * Yearly Data Entry Sub-component
 * Handles the yearly data entry mode
 */
const YearlyDataEntry = ({
  reportingYearType,
  reportingYear,
  isProcessEmissions,
  selectedTemplate,
  formConfig,
  dynamicInputFields,
  yearlyData,
  setYearlyData,
  scope3Method,
  getFieldUnitsForYearly,
  centralizedUnits,
  defaultUnit,
  isVolumeUnit,
  useCustomFuel,
  calculationMethodology,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">
          Annual Data for {reportingYearType === 'financial' 
            ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}` 
            : `CY${reportingYear}`}
        </Label>
      </div>

      <div className="p-4 border rounded-lg bg-stone-50 space-y-4">
        {/* For Process Emissions: Show template required input field with fixed unit */}
        {isProcessEmissions && selectedTemplate ? (
          <div className="space-y-4">
            {selectedTemplate.input_fields?.map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{field.label} (Annual Total) {!field.is_optional && '*'}</Label>
                  <Input
                    type={field.data_type === 'number' ? 'number' : 'text'}
                    step={field.data_type === 'number' ? 'any' : undefined}
                    min="0"
                    placeholder={`Enter annual ${field.label.toLowerCase()}`}
                    value={yearlyData[field.key] || ''}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-white"
                    data-testid={`yearly-${field.key}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <select
                    value={yearlyData[`${field.key}_unit`] || field.unit || 'kg'}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.key}_unit`]: e.target.value }))}
                    className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                    data-testid={`yearly-${field.key}-unit`}
                  >
                    {['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        ) : formConfig && dynamicInputFields.length > 0 ? (
          /* Dynamic Fields from ce_input_field_mappings for yearly */
          <div className="space-y-6">
            {/* Supplier Method Disclaimer */}
            {scope3Method === 'supplier_basis' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the "Quantity Used" field.
                </p>
              </div>
            )}
            
            {/* Required Inputs Section */}
            {dynamicInputFields.filter(f => f.required && !f.isOverride).length > 0 && (
              <div className="space-y-4">
                {dynamicInputFields.filter(f => f.required && !f.isOverride).map(field => {
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const isSupplierBasis = scope3Method === 'supplier_basis';
                  const isNoUnitField = field.unitSource === 'none';
                  const isTextUnitField = field.unitSource === 'text';
                  const isUnitlessCountField = isNoUnitField;
                  const showUnitSelector = !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis;
                  const showUnitTextInput = !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                  
                  return (
                    <div key={field.variable} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        {field.label} <span className="text-red-500">*</span>
                        {field.tooltip && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-4 h-4 text-stone-400" />
                              </TooltipTrigger>
                              <TooltipContent>{field.tooltip}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </Label>
                      {field.fieldType === 'select' && field.options ? (
                        <select
                          value={yearlyData[field.variable] || ''}
                          onChange={(e) => setYearlyData(prev => ({ ...prev, [field.variable]: e.target.value }))}
                          className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                        >
                          <option value="">Select {field.label}</option>
                          {field.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={showUnitSelector || showUnitTextInput ? "grid grid-cols-3 gap-2" : ""}>
                          <Input
                            type="number"
                            step={isUnitlessCountField ? "1" : "any"}
                            min="0"
                            placeholder={field.placeholder || `Enter annual ${field.label.toLowerCase()}`}
                            value={yearlyData[field.variable] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || parseFloat(val) >= 0) {
                                if (isUnitlessCountField && val !== '') {
                                  const numVal = parseFloat(val);
                                  if (!Number.isInteger(numVal)) {
                                    toast.error(`${field.label} must be a whole number`);
                                    return;
                                  }
                                }
                                setYearlyData(prev => ({ ...prev, [field.variable]: val }));
                              }
                            }}
                            className={showUnitSelector || showUnitTextInput ? "col-span-2 bg-white" : "bg-white"}
                          />
                          {showUnitSelector && (
                            <select
                              value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                            >
                              {fieldUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          )}
                          {showUnitTextInput && (
                            <Input
                              type="text"
                              placeholder="Unit"
                              value={yearlyData[`${field.variable}_unit`] || ''}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className="bg-white"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Optional Inputs Section with Override Toggle */}
            {dynamicInputFields.filter(f => !f.required && !f.isOverride).length > 0 && (
              <div className="space-y-4">
                {dynamicInputFields.filter(f => !f.required && !f.isOverride).map(field => {
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const isSupplierBasis = scope3Method === 'supplier_basis';
                  const isNoUnitField = field.unitSource === 'none';
                  const isTextUnitField = field.unitSource === 'text';
                  const isUnitlessCountField = isNoUnitField;
                  const showUnitSelector = !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis;
                  const showUnitTextInput = !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                  const overrideKey = `override_${field.variable}`;
                  const isOverrideEnabled = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
                  
                  return (
                    <div key={field.variable} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          {field.label}
                          {(field.tooltip || FIELD_HELP[field.variable]) && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`${field.label} info`}
                                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-400 hover:text-emerald-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                    data-testid={`field-help-${field.variable}`}
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
                                  {field.tooltip || FIELD_HELP[field.variable]}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`yearly-override-${field.variable}`}
                            checked={isOverrideEnabled}
                            onChange={(e) => setYearlyData(prev => ({ 
                              ...prev, 
                              [overrideKey]: e.target.checked,
                              ...(e.target.checked ? {} : { [field.variable]: '', [`${field.variable}_unit`]: '' })
                            }))}
                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <label 
                            htmlFor={`yearly-override-${field.variable}`} 
                            className="text-xs text-amber-600 font-medium"
                          >
                            Override Default
                          </label>
                        </div>
                      </div>
                      <div className={showUnitSelector || showUnitTextInput ? "grid grid-cols-3 gap-2" : ""}>
                        <Input
                          type="number"
                          step={isUnitlessCountField ? "1" : "any"}
                          min="0"
                          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                          value={yearlyData[field.variable] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || parseFloat(val) >= 0) {
                              if (isUnitlessCountField && val !== '') {
                                const numVal = parseFloat(val);
                                if (!Number.isInteger(numVal)) {
                                  toast.error(`${field.label} must be a whole number`);
                                  return;
                                }
                              }
                              setYearlyData(prev => ({ ...prev, [field.variable]: val }));
                            }
                          }}
                          disabled={!isOverrideEnabled}
                          className={`${showUnitSelector || showUnitTextInput ? "col-span-2" : ""} bg-white ${!isOverrideEnabled ? "opacity-50" : ""}`}
                        />
                        {showUnitSelector && (
                          <select
                            value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                            disabled={!isOverrideEnabled}
                            className={`w-full h-10 bg-white border border-stone-200 rounded-lg px-3 ${!isOverrideEnabled ? "opacity-50" : ""}`}
                          >
                            {fieldUnits.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        )}
                        {showUnitTextInput && (
                          <Input
                            type="text"
                            placeholder="Unit"
                            value={yearlyData[`${field.variable}_unit`] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                            disabled={!isOverrideEnabled}
                            className={`bg-white ${!isOverrideEnabled ? "opacity-50" : ""}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Per-year custom fuel fields (EF, CV, carbon content etc.) */}
            {useCustomFuel && (
              <CustomFuelMonthFields
                monthKey="yearly"
                data={yearlyData}
                updateMonthData={(_, field, value) => setYearlyData(prev => ({ ...prev, [field]: value }))}
                calculationMethodology={calculationMethodology}
              />
            )}
            
            {/* Override Properties Section for Yearly */}
            {dynamicInputFields.filter(f => f.isOverride).length > 0 && (
              <div className="space-y-6">
                {dynamicInputFields.filter(f => f.isOverride).map(field => {
                  const overrideKey = `override_${field.variable}`;
                  const isOverrideEnabled = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
                  const fieldUnits = getFieldUnitsForYearly(field);
                  
                  return (
                    <div key={field.variable} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          {field.label}
                          {(field.tooltip || FIELD_HELP[field.variable]) && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`${field.label} info`}
                                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-400 hover:text-emerald-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                    data-testid={`field-help-${field.variable}`}
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
                                  {field.tooltip || FIELD_HELP[field.variable]}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </Label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isOverrideEnabled}
                            onChange={(e) => setYearlyData(prev => ({ 
                              ...prev, 
                              [overrideKey]: e.target.checked,
                              ...(e.target.checked ? {} : { [field.variable]: '', [`${field.variable}_unit`]: '' })
                            }))}
                            className="rounded border-stone-300"
                          />
                          <span className="text-amber-600">Override Default</span>
                        </label>
                      </div>
                      
                      <div className={field.expectedUnit ? "grid grid-cols-3 gap-2" : ""}>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          value={yearlyData[field.variable] || ''}
                          disabled={!isOverrideEnabled}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || parseFloat(val) >= 0) {
                              setYearlyData(prev => ({ ...prev, [field.variable]: val }));
                            }
                          }}
                          className={`${field.expectedUnit ? 'col-span-2' : ''} bg-white ${!isOverrideEnabled ? 'opacity-50' : ''}`}
                        />
                        {field.expectedUnit && (
                          fieldUnits.length > 1 ? (
                            <select
                              value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                              disabled={!isOverrideEnabled}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className={`w-full h-10 bg-white border border-stone-200 rounded-lg px-3 ${!isOverrideEnabled ? 'opacity-50' : ''}`}
                            >
                              {fieldUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          ) : (
                            <div className={`flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 text-stone-600 ${!isOverrideEnabled ? 'opacity-50' : ''}`}>
                              <span>{field.expectedUnit}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Legacy mode: Simple quantity/unit input for yearly */
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Annual Quantity <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Enter annual total"
                  value={yearlyData.quantity || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || parseFloat(val) >= 0) {
                      setYearlyData(prev => ({ ...prev, quantity: val }));
                    }
                  }}
                  className="bg-white"
                  data-testid="yearly-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <select
                  value={yearlyData.unit || defaultUnit}
                  onChange={(e) => setYearlyData(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                  data-testid="yearly-unit"
                >
                  {centralizedUnits.map(u => (
                    <option key={u.id || u.symbol} value={u.symbol}>{u.symbol} ({u.name})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Show density input if volume unit */}
            {isVolumeUnit(yearlyData.unit || defaultUnit, centralizedUnits) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Density (kg/L) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Enter density"
                    value={yearlyData.density || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || parseFloat(val) >= 0) {
                        setYearlyData(prev => ({ ...prev, density: val }));
                      }
                    }}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Density Justification</Label>
                  <Input
                    placeholder="Source/justification for density value"
                    value={yearlyData.densityJustification || ''}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, densityJustification: e.target.value }))}
                    className="bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Step3YearMonthlyData;
