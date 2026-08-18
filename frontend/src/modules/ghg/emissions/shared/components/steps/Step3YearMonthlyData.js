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

const MonthlyEvidenceCell = ({
  monthKey,
  evidences = [],
  handleEvidenceUpload,
  removeEvidence,
  backendUrl,
}) => (
  <div className="min-w-0 space-y-3 lg:border-l lg:border-stone-200 lg:pl-6" data-testid={`month-${monthKey}-evidence-cell`}>
    <Label>Evidence <span className="text-xs font-normal text-stone-500">(optional)</span></Label>
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/40 p-3 transition-colors hover:bg-slate-50" data-testid={`month-${monthKey}-evidence-upload-zone`}>
      <input
        type="file"
        id={`evidence-${monthKey}`}
        className="hidden"
        multiple
        onChange={async (event) => {
          const files = Array.from(event.target.files || []);
          for (const file of files) await handleEvidenceUpload(monthKey, file);
          event.target.value = '';
        }}
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx,.gif,.webp"
        data-testid={`month-${monthKey}-evidence-input`}
      />
      <label htmlFor={`evidence-${monthKey}`} className="flex cursor-pointer flex-col items-center gap-1.5 py-1 text-center" data-testid={`month-${monthKey}-evidence-upload-trigger`}>
        <Upload className="h-6 w-6 text-stone-400" />
        <span className="text-sm text-stone-600">Upload evidence</span>
        <span className="text-xs text-stone-400">PDF, image, Excel, Word</span>
      </label>
    </div>
    {evidences.length > 0 && (
      <div className="space-y-2" data-testid={`month-${monthKey}-evidence-list`}>
        {evidences.map((evidence, index) => {
          const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
          const fileId = fileIdMatch ? fileIdMatch[1] : null;
          const viewUrl = fileId ? `${backendUrl}/api/files/${fileId}/view` : evidence.url;
          const downloadUrl = fileId ? `${backendUrl}/api/files/${fileId}/download` : evidence.url;
          return (
            <div key={`${evidence.url || evidence.filename}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md bg-green-50 p-2">
              <FileText className="h-4 w-4 shrink-0 text-green-600" />
              <span className="min-w-0 flex-1 truncate text-xs text-green-700" title={evidence.filename}>{evidence.filename}</span>
              <div className="flex shrink-0 items-center gap-1">
                <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-600 hover:text-blue-800" title="View evidence" data-testid={`month-${monthKey}-evidence-view-${index}`}><Eye className="h-3.5 w-3.5" /></a>
                {fileId && <button type="button" onClick={() => window.open(downloadUrl, '_blank')} className="p-1 text-green-700 hover:text-green-900" title="Download evidence" data-testid={`month-${monthKey}-evidence-download-${index}`}><Download className="h-3.5 w-3.5" /></button>}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeEvidence(monthKey, index)} className="h-6 p-1 text-red-500 hover:bg-red-50 hover:text-red-700" title="Remove evidence" data-testid={`month-${monthKey}-evidence-remove-${index}`}><X className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const MonthlyLedger = ({ children }) => (
  <div className="overflow-hidden rounded-lg border border-stone-200 bg-white" data-testid="monthly-emissions-ledger">
    <div className="hidden grid-cols-[9rem_minmax(0,1fr)_18rem] gap-6 border-b border-stone-200 bg-stone-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500 lg:grid">
      <span>Month</span>
      <span>Quantity</span>
      <span>Evidence</span>
    </div>
    <div>{children}</div>
  </div>
);

// Import volume unit helper
import { isVolumeUnit } from '../../../../../../utils/helpers/unit-utils';
import { isQuantityField } from '../../utils/unitHelpers';
import { buildNativeOptionsHtml } from '../../utils/nativeSelectOptions';

// Import FlightDetailsSection for C6 air travel per-month airport selection
import { FlightDetailsSection } from '../../../../../../components/FlightDetailsSection';
import { ReportingPeriodControls } from '../ReportingPeriodControls';

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
  showReportingControls = true,
  // Reporting period props
  reportingYearType,
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
  category,
  capabilities = {},
  fieldOptions = {},
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
    <div className="space-y-8">
      {showReportingControls && (
        <ReportingPeriodControls
          reportingYearType={reportingYearType}
          reportingYear={reportingYear}
          setReportingYear={setReportingYear}
          frequencyType={frequencyType}
          setFrequencyType={setFrequencyType}
          editingEmission={editingEmission}
          setMonthlyData={setMonthlyData}
          setYearlyData={setYearlyData}
          setExpandedMonths={setExpandedMonths}
        />
      )}

      {/* Multi-Employee Input for C7 Employee Commuting */}
      {isC7EmployeeCommuting && (
        <>
          {/* Supplier Method Disclaimer for C7 */}
          {scope3Method === 'supplier_basis' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the &quot;Quantity Used&quot; field.
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
        <div className="space-y-6">
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
                <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the &quot;Quantity Used&quot; field.
              </p>
            </div>
          )}

          <MonthlyLedger>
            {activeMonths.map(month => {
              const monthKey = month.key;
              const status = getMonthStatus(monthKey);
              const data = monthlyData[monthKey] || {};
              const isDisabled = isFutureMonth(monthKey, reportingYear, reportingYearType);
              const displayYear = getActualYearForMonth(monthKey);

              return (
                <div
                  key={monthKey} 
                  className={`border-b border-stone-200 px-5 py-5 last:border-b-0 ${isDisabled ? 'bg-stone-50/70 opacity-60' : ''}`}
                  data-testid={`month-${monthKey}-ledger-row`}
                >
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[9rem_minmax(0,1fr)_18rem]">
                    <div className="flex items-start gap-3 pt-1" data-testid={`month-${monthKey}-ledger-month`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        isDisabled ? 'bg-stone-200' : status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                      }`} />
                      <div>
                        <p className={`font-medium ${isDisabled ? 'text-stone-400' : 'text-stone-800'}`}>
                          {month.name} {displayYear}
                        </p>
                        {isDisabled ? (
                          <span className="text-xs text-stone-400">Future month</span>
                        ) : status === 'filled' ? (
                          <span className="flex items-center gap-1 text-xs text-green-700"><Check className="h-3.5 w-3.5" /> Complete</span>
                        ) : (
                          <span className="text-xs text-stone-400">Not entered</span>
                        )}
                      </div>
                    </div>
                    {!isDisabled ? (
                      <>
                        <div className="min-w-0 space-y-6" data-testid={`month-${monthKey}-ledger-quantity`}>
                      {/* Flight Details — C6 Business Travel + air_travel only */}
                      {scope3ActivityType === 'air_travel' && capabilities.flightDetails && (
                        <FlightDetailsSection
                          monthKey={monthKey}
                          data={data}
                          updateMonthData={updateMonthData}
                          disabled={isDisabled}
                        />
                      )}

                      {/* For Process Emissions: Show template required input field with fixed unit */}
                      {isProcessEmissions && selectedTemplate ? (
                        <div className="space-y-4">
                          {selectedTemplate.input_fields?.map((field) => (
                            <div key={field.key} className="space-y-2">
                              <Label>{field.label} {!field.is_optional && '*'}</Label>
                              <div className="flex overflow-hidden rounded-md border border-stone-200 bg-stone-50 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                                <Input
                                  type={field.data_type === 'number' ? 'number' : 'text'}
                                  step={field.data_type === 'number' ? 'any' : undefined}
                                  min="0"
                                  placeholder={`Enter ${field.label.toLowerCase()}`}
                                  value={data[field.key] || ''}
                                  onChange={(e) => updateMonthData(monthKey, field.key, e.target.value)}
                                  className="h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                                  data-testid={`month-${monthKey}-${field.key}`}
                                />
                                <select
                                  value={data[`${field.key}_unit`] || field.unit || 'kg'}
                                  onChange={(e) => updateMonthData(monthKey, `${field.key}_unit`, e.target.value)}
                                  className="h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                                  data-testid={`month-${monthKey}-${field.key}-unit`}
                                  dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3']) }}
                                />
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
                        <div className={useCustomFuel ? "" : "max-w-xl"}>
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <div className="flex overflow-hidden rounded-md border border-stone-200 bg-stone-50 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Enter quantity"
                                value={data.quantity || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) updateMonthData(monthKey, 'quantity', val);
                                }}
                                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                className="h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                              />
                              {!useCustomFuel && <select
                                value={data.unit || defaultUnit}
                                onChange={(e) => updateMonthData(monthKey, 'unit', e.target.value)}
                                className="h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                                dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(allowedUnits) }}
                              />}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Per-month custom fuel fields (EF, CV, carbon content etc.) */}
                      {useCustomFuel && (
                        <>
                          <CustomFuelMonthFields
                            monthKey={monthKey}
                            data={data}
                            updateMonthData={updateMonthData}
                            calculationMethodology={calculationMethodology}
                            fieldOptions={fieldOptions}
                          />
                        </>
                      )}
                        </div>
                        <MonthlyEvidenceCell
                          monthKey={monthKey}
                          evidences={data.evidences}
                          handleEvidenceUpload={handleEvidenceUpload}
                          removeEvidence={removeEvidence}
                          backendUrl={BACKEND_URL}
                        />
                      </>
                    ) : (
                      <div className="col-span-2 flex items-center text-sm text-stone-400" data-testid={`month-${monthKey}-future-notice`}>
                        This period is not available yet.
                      </div>
                    )}
                  </div>

                  {!isDisabled && formConfig && dynamicInputFields.length > 0 && (dynamicInputFields.some(field => field.isOverride || (!field.required && !field.isOverride))) && (
                        <details className="group mt-5 border-t border-stone-200 pt-4" data-testid={`month-${monthKey}-additional-details`}>
                          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 transition-colors hover:text-emerald-700" data-testid={`month-${monthKey}-additional-details-trigger`}>
                            <span className="transition-transform duration-200 group-open:rotate-90">▸</span>
                            Additional details
                          </summary>
                          <div className="space-y-8 pt-6" data-testid={`month-${monthKey}-additional-details-content`}>
                            {dynamicInputFields.filter(field => field.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                            {dynamicInputFields.filter(field => !field.required && !field.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                          </div>
                        </details>
                      )}

                      {/* Override Options - Scope 1 and Biogenic (not for Fugitive Emissions) */}
                      {!isDisabled && !formConfig && (scope === 'scope1' || scope === 'biogenic') && !useCustomFuel && selectedFuel && capabilities.manualFactorOverrides && (
                        <details className="group mt-5 border-t border-stone-200 pt-4" data-testid={`month-${monthKey}-fuel-additional-details`}>
                          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 transition-colors hover:text-emerald-700" data-testid={`month-${monthKey}-fuel-additional-details-trigger`}>
                            <span className="transition-transform duration-200 group-open:rotate-90">▸</span>
                            Additional details
                          </summary>
                          <div className="mt-5 space-y-6 border-l-2 border-amber-200 pl-4" data-testid={`month-${monthKey}-fuel-additional-details-content`}>
                          <div className="space-y-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
                            <input
                              type="checkbox"
                              id={`override-cv-${monthKey}`}
                              checked={data.overrideCalorificValue || false}
                              onChange={(e) => updateMonthData(monthKey, 'overrideCalorificValue', e.target.checked)}
                              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                              data-testid={`month-${monthKey}-override-calorific-value`}
                            />
                            <span>
                              Calorific Value (if available) <span className="text-gray-500">({selectedFuel?.calorific_value_unit})</span>
                            </span>
                          </label>

                          {data.overrideCalorificValue && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                                data-testid={`month-${monthKey}-calorific-value-input`}
                              />
                              <Input
                                placeholder="Justifications/Comments *"
                                value={data.calorificValueJustification || ''}
                                onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)}
                                className="bg-white"
                                required
                                data-testid={`month-${monthKey}-calorific-value-justification-input`}
                              />
                            </div>
                          )}
                          </div>

                          {/* Only show Density option if volume unit is selected */}
                          {isVolumeUnit(data.unit || defaultUnit, centralizedUnits) && (
                            <div className="space-y-3">
                              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
                                <input
                                  type="checkbox"
                                  id={`override-density-${monthKey}`}
                                  checked={data.overrideDensity || false}
                                  onChange={(e) => updateMonthData(monthKey, 'overrideDensity', e.target.checked)}
                                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  data-testid={`month-${monthKey}-override-density`}
                                />
                                <span>
                                  Density Value (if available) <span className="text-gray-500">({selectedFuel?.density_unit})</span>
                                </span>
                              </label>

                              {data.overrideDensity && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                                    data-testid={`month-${monthKey}-density-input`}
                                  />
                                  <Input
                                    placeholder="Justifications/Comments *"
                                    value={data.densityJustification || ''}
                                    onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)}
                                    className="bg-white"
                                    required
                                    data-testid={`month-${monthKey}-density-justification-input`}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          </div>
                        </details>
                      )}

                      {/* Override Options - Scope 2 */}
                      {!isDisabled && !formConfig && scope === 'scope2' && !useCustomFuel && (
                        <div className="mt-5 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
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
              );
            })}
          </MonthlyLedger>
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
          scope3ActivityType={scope3ActivityType}
          category={category}
          capabilities={capabilities}
          fieldOptions={fieldOptions}
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
  scope3ActivityType,
  category,
  capabilities = {},
  fieldOptions = {},
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
        {/* Flight Details — C6 Business Travel + air_travel (yearly mode) */}
        {scope3ActivityType === 'air_travel' && capabilities.flightDetails && (
          <FlightDetailsSection
            monthKey="yearly"
            data={yearlyData}
            updateMonthData={(_, field, value) => setYearlyData(prev => ({ ...prev, [field]: value }))}
            disabled={false}
          />
        )}

        {/* For Process Emissions: Show template required input field with fixed unit */}
        {isProcessEmissions && selectedTemplate ? (
          <div className="space-y-4">
            {selectedTemplate.input_fields?.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label} (Annual Total) {!field.is_optional && '*'}</Label>
                <div className="flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                  <Input
                    type={field.data_type === 'number' ? 'number' : 'text'}
                    step={field.data_type === 'number' ? 'any' : undefined}
                    min="0"
                    placeholder={`Enter annual ${field.label.toLowerCase()}`}
                    value={yearlyData[field.key] || ''}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    data-testid={`yearly-${field.key}`}
                  />
                  <select
                    value={yearlyData[`${field.key}_unit`] || field.unit || 'kg'}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.key}_unit`]: e.target.value }))}
                    className="h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                    data-testid={`yearly-${field.key}-unit`}
                    dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3']) }}
                  />
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
                <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the &quot;Quantity Used&quot; field.
                </p>
              </div>
            )}
            
            {/* Required Inputs Section */}
            {dynamicInputFields.filter(f => f.required && !f.isOverride).length > 0 && (
              <div className="space-y-4">
                {dynamicInputFields.filter(f => f.required && !f.isOverride).map(field => {
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const hideStandardQuantityUnit = useCustomFuel && isQuantityField(field);
                  const isSupplierBasis = scope3Method === 'supplier_basis';
                  const isNoUnitField = field.unitSource === 'none';
                  const isTextUnitField = field.unitSource === 'text';
                  const isUnitlessCountField = isNoUnitField;
                  const showUnitSelector = !hideStandardQuantityUnit && !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis;
                  const showUnitTextInput = !hideStandardQuantityUnit && !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                  
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
                          dangerouslySetInnerHTML={{
                            __html: buildNativeOptionsHtml(field.options, {
                              placeholder: `Select ${field.label}`,
                              getValue: (option) => option.value || option,
                              getLabel: (option) => option.label || option,
                            }),
                          }}
                        />
                      ) : (
                        <div className={showUnitSelector || showUnitTextInput ? "flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100" : ""}>
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
                            className={showUnitSelector || showUnitTextInput ? "h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0" : "bg-white"}
                          />
                          {showUnitSelector && (
                            <select
                              value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className="h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                              dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldUnits) }}
                            />
                          )}
                          {showUnitTextInput && (
                            <Input
                              type="text"
                              placeholder="Unit"
                              value={yearlyData[`${field.variable}_unit`] || ''}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className="h-10 min-w-24 rounded-none border-0 border-l border-l-stone-200 bg-transparent shadow-none focus-visible:ring-0"
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
                  const hideStandardQuantityUnit = useCustomFuel && isQuantityField(field);
                  const isSupplierBasis = scope3Method === 'supplier_basis';
                  const isNoUnitField = field.unitSource === 'none';
                  const isTextUnitField = field.unitSource === 'text';
                  const isUnitlessCountField = isNoUnitField;
                  const showUnitSelector = !hideStandardQuantityUnit && !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis;
                  const showUnitTextInput = !hideStandardQuantityUnit && !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                  const overrideKey = `override_${field.variable}`;
                  const isOverrideEnabled = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
                  
                  return (
                    <div key={field.variable} className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-700">
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
                            data-testid={`yearly-override-${field.variable}`}
                          />
                          Override Default
                        </label>
                      </div>
                      <div className={showUnitSelector || showUnitTextInput ? "flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100" : ""}>
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
                          className={`${showUnitSelector || showUnitTextInput ? "h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0" : "bg-white"} ${!isOverrideEnabled ? "opacity-50" : ""}`}
                        />
                        {showUnitSelector && (
                          <select
                            value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                            disabled={!isOverrideEnabled}
                            className={`h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none ${!isOverrideEnabled ? "opacity-50" : ""}`}
                            dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldUnits) }}
                          />
                        )}
                        {showUnitTextInput && (
                          <Input
                            type="text"
                            placeholder="Unit"
                            value={yearlyData[`${field.variable}_unit`] || ''}
                            onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                            disabled={!isOverrideEnabled}
                            className={`h-10 min-w-24 rounded-none border-0 border-l border-l-stone-200 bg-transparent shadow-none focus-visible:ring-0 ${!isOverrideEnabled ? "opacity-50" : ""}`}
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
              fieldOptions={fieldOptions}
              />
            )}
            
            {/* Override Properties Section for Yearly */}
            {dynamicInputFields.filter(f => f.isOverride).length > 0 && (
              <div className="space-y-6">
                {dynamicInputFields.filter(f => f.isOverride).map(field => {
                  const overrideKey = `override_${field.variable}`;
                  const isOverrideEnabled = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const showStandardExpectedUnit = field.expectedUnit && !(useCustomFuel && isQuantityField(field));
                  
                  return (
                    <div key={field.variable} className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-700">
                          <input
                            type="checkbox"
                            checked={isOverrideEnabled}
                            onChange={(e) => setYearlyData(prev => ({ 
                              ...prev, 
                              [overrideKey]: e.target.checked,
                              ...(e.target.checked ? {} : { [field.variable]: '', [`${field.variable}_unit`]: '' })
                            }))}
                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            data-testid={`yearly-override-${field.variable}`}
                          />
                          Override Default
                        </label>
                      </div>
                      
                      <div className={showStandardExpectedUnit ? "flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100" : ""}>
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
                          className={`${showStandardExpectedUnit ? 'h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0' : 'bg-white'} ${!isOverrideEnabled ? 'opacity-50' : ''}`}
                        />
                        {showStandardExpectedUnit && (
                          fieldUnits.length > 1 ? (
                            <select
                              value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                              disabled={!isOverrideEnabled}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className={`h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none ${!isOverrideEnabled ? 'opacity-50' : ''}`}
                              dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldUnits) }}
                            />
                          ) : (
                            <div className={`flex h-10 min-w-24 items-center border-l border-l-stone-200 bg-stone-100 px-3 text-sm text-stone-600 ${!isOverrideEnabled ? 'opacity-50' : ''}`}>
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
            <div className={useCustomFuel ? "" : "max-w-xl"}>
              <div className="space-y-2">
                <Label>Annual Quantity <span className="text-red-500">*</span></Label>
                <div className="flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Enter annual total"
                    value={yearlyData.quantity || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || parseFloat(val) >= 0) setYearlyData(prev => ({ ...prev, quantity: val }));
                    }}
                    className="h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    data-testid="yearly-quantity"
                  />
                  {!useCustomFuel && <select
                    value={yearlyData.unit || defaultUnit}
                    onChange={(e) => setYearlyData(prev => ({ ...prev, unit: e.target.value }))}
                    className="h-10 min-w-28 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                    data-testid="yearly-unit"
                    dangerouslySetInnerHTML={{
                      __html: buildNativeOptionsHtml(centralizedUnits, {
                        getValue: (unit) => unit.symbol,
                        getLabel: (unit) => `${unit.symbol} (${unit.name})`,
                      }),
                    }}
                  />}
                </div>
              </div>
            </div>

            {useCustomFuel && (
              <CustomFuelMonthFields
                monthKey="yearly"
                data={yearlyData}
                updateMonthData={(_, field, value) => setYearlyData(prev => ({ ...prev, [field]: value }))}
                calculationMethodology={calculationMethodology}
              fieldOptions={fieldOptions}
              />
            )}

            {/* Show density input if volume unit */}
            {!useCustomFuel && isVolumeUnit(yearlyData.unit || defaultUnit, centralizedUnits) && (
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
