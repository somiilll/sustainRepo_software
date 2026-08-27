/**
 * Step 3: Year & Monthly Data Component
 * Handles reporting year selection, frequency, and data entry
 * This is the largest step component (~1000 lines extracted)
 * 
 * NOTE: Due to the extreme complexity and tight coupling with parent state,
 * this component receives all necessary data via props and renders the JSX.
 * The parent (EmissionEntryForm) manages all state and callbacks.
 */

import React, { useEffect, useMemo } from 'react';
import { Label } from '../../../../../../components/ui/label';
import { Input } from '../../../../../../components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../../../components/ui/tooltip';
import { Info, Upload, X, FileText } from 'lucide-react';
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

const FUEL_DEFAULT_VALUE_KEYS = {
  cv: 'calorific_value',
  density: 'density',
  co2_ef: 'emission_factor_co2',
  ch4_ef: 'emission_factor_ch4',
  n2o_ef: 'emission_factor_n2o',
  emission_factor_basis_quantity: 'emission_factor_basis_quantity',
  co2_gwp_fugitives: 'gwp_fugitives',
};

const FUEL_DEFAULT_UNIT_KEYS = {
  cv: 'calorific_value_unit',
  density: 'density_unit',
  emission_factor_basis_quantity: 'emission_factor_basis_unit',
};

const hasFieldValue = (value) => value !== undefined && value !== null && value !== '';

const getFieldDefaultValue = (field, selectedFuel) => {
  if (hasFieldValue(field.defaultValue)) return field.defaultValue;
  const fuelKey = FUEL_DEFAULT_VALUE_KEYS[field.variable];
  return fuelKey && hasFieldValue(selectedFuel?.[fuelKey]) ? selectedFuel[fuelKey] : '';
};

const getFieldDefaultUnit = (field, selectedFuel, fieldUnits) => {
  const fuelKey = FUEL_DEFAULT_UNIT_KEYS[field.variable];
  return selectedFuel?.[fuelKey] || field.expectedUnit || fieldUnits[0] || '';
};

const isCvField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(cv|calorific)(_|$)/i.test(identity)
    || /calorific|\bcv\b/i.test(field.label || '');
};

const isEfField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(ef|emission_factor)(_|$)/i.test(identity)
    || /emission factor|\bef\b/i.test(field.label || '');
};

const isCarbonContentField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /carbon.*content|composition.*carbon/i.test(identity)
    || /carbon.*content|composition.*carbon/i.test(field.label || '');
};

const getMonthlyFieldValue = (field = {}, data = {}) => {
  const valueKey = field.valueKey || field.variable || field.fieldKey;
  return data[valueKey] ?? data[field.variable] ?? data[field.fieldKey];
};

const hasNumericFieldValue = (field, data) => {
  const value = getMonthlyFieldValue(field, data);
  return hasFieldValue(value) && Number.isFinite(Number(value));
};

const hasDensitySourceValues = ({ quantityField, referenceField, data }) => (
  hasNumericFieldValue(quantityField, data) && hasNumericFieldValue(referenceField, data)
);

/** The unit shown in a row and the unit used for conversions must be identical. */
const resolveEffectiveFieldUnit = ({
  field,
  data,
  selectedFuel,
  fieldUnits = [],
  isProcessEmissions = false,
}) => {
  if (!field) return '';
  const valueKey = field.valueKey || field.variable || field.fieldKey;
  const unitKey = field.unitKey || `${valueKey}_unit`;
  const storedValue = getMonthlyFieldValue(field, data) ?? '';
  const defaultValue = getFieldDefaultValue(field, selectedFuel);
  const storedUnit = data[unitKey]
    || (!isProcessEmissions ? data.unit : '')
    || '';
  const defaultUnit = field.defaultUnit || getFieldDefaultUnit(field, selectedFuel, fieldUnits);
  return !hasFieldValue(storedValue) && hasFieldValue(defaultValue)
    ? defaultUnit
    : (storedUnit || defaultUnit);
};

/**
 * Compact evidence icon — upload trigger + badge showing file count.
 * Keeps rows aligned regardless of how many files are attached.
 */
const EvidenceIconCell = ({
  monthKey,
  evidences = [],
  handleEvidenceUpload,
  removeEvidence,
  backendUrl,
  showLabel = false,
}) => {
  const count = evidences.length;
  return (
    <div className="flex items-center justify-center" data-testid={`month-${monthKey}-evidence-cell`}>
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

      {/* Upload trigger icon */}
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              htmlFor={`evidence-${monthKey}`}
              className={`relative inline-flex cursor-pointer items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-emerald-600 ${showLabel ? 'h-10 gap-2 border border-stone-200 bg-white px-3 text-sm font-medium' : 'h-8 w-8'}`}
              data-testid={`month-${monthKey}-evidence-upload-trigger`}
            >
              <Upload className="h-4 w-4" />
              {showLabel && <span>{count > 0 ? `${count} file${count > 1 ? 's' : ''} attached` : 'Upload evidence'}</span>}
              {!showLabel && count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </label>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" className="max-w-xs">
            {count === 0 ? (
              <span className="text-xs">Upload evidence (PDF, image, Excel, Word)</span>
            ) : (
              <div className="space-y-1.5 text-xs">
                <span className="font-medium">{count} file{count > 1 ? 's' : ''} attached</span>
                {evidences.map((evidence, index) => {
                  const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                  const fileId = fileIdMatch ? fileIdMatch[1] : null;
                  const viewUrl = fileId ? `${backendUrl}/api/files/${fileId}/view` : evidence.url;
                  return (
                    <div key={`${evidence.url || evidence.filename}-${index}`} className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0 text-green-600" />
                      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-blue-600 hover:underline" title={evidence.filename} data-testid={`month-${monthKey}-evidence-view-${index}`}>
                        {evidence.filename}
                      </a>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeEvidence(monthKey, index); }} className="shrink-0 text-red-400 hover:text-red-600" title="Remove" data-testid={`month-${monthKey}-evidence-remove-${index}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <span className="text-stone-400">Click icon to add more</span>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

/**
 * Derive column definitions for the ledger header.
 * Columns come from:
 *   1. dynamicInputFields (required, non-override)
 *   2. Process-emission template input_fields
 *   3. Legacy fallback → single "Quantity" column
 */
const getCustomFuelLedgerColumns = (calculationMethodology, isFugitiveCustomFuel) => {
  if (isFugitiveCustomFuel) return [];
  const factorColumns = calculationMethodology === 'using_heat_basis_ncv'
    ? [
      { key: 'custom_ef', label: 'Emission Factor', customFuelField: 'emission-factor', required: true },
      { key: 'custom_cv', label: 'Calorific Value', customFuelField: 'calorific-value', required: true },
    ]
    : calculationMethodology === 'using_qty_basis_ef'
      ? [{ key: 'custom_ef', label: 'Emission Factor', customFuelField: 'emission-factor', required: true }]
      : calculationMethodology === 'using_carbon_composition'
        ? [
          { key: 'custom_carbon_content', label: 'Carbon Content (%)', customFuelField: 'carbon-content', required: true },
          { key: 'custom_oxidation_factor', label: 'Oxidation Factor', customFuelField: 'oxidation-factor', required: true },
        ]
        : [];

  return [...factorColumns, { key: 'density', label: 'Density', customFuelField: 'density' }];
};

const deriveLedgerColumns = (
  dynamicInputFields,
  formConfig,
  isProcessEmissions,
  selectedTemplate,
  useCustomFuel,
  calculationMethodology,
  isFugitiveCustomFuel,
) => {
  if (isProcessEmissions && selectedTemplate?.input_fields?.length > 0) {
    return selectedTemplate.input_fields.map(f => ({
      key: f.key,
      label: f.label,
      unit: null,
      required: !f.is_optional,
    }));
  }
  if (formConfig && dynamicInputFields.length > 0) {
    const primaryColumns = dynamicInputFields.map(f => ({
      key: f.variable,
      label: f.label,
      unit: null,
      required: (f.required && !f.isOverride)
        || (isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives'),
      isOverride: !!f.isOverride && !(isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives'),
      isOptional: !f.required && !f.isOverride,
    }));
    return useCustomFuel
      ? [...primaryColumns, ...getCustomFuelLedgerColumns(calculationMethodology, isFugitiveCustomFuel)]
      : primaryColumns;
  }
  // Legacy fallback
  const primaryColumns = [{ key: 'quantity', label: 'Quantity', unit: null, required: true }];
  return useCustomFuel
    ? [...primaryColumns, ...getCustomFuelLedgerColumns(calculationMethodology, isFugitiveCustomFuel)]
    : primaryColumns;
};

const MonthlyLedger = ({ columns, rows }) => {
  const headerCells = columns.map((col) => React.createElement(
    'th',
    { key: col.key, className: 'px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-500' },
    col.label,
    col.required && React.createElement('span', { className: 'ml-0.5 text-red-500' }, '*'),
    col.unit && React.createElement('span', { className: 'ml-1 font-normal normal-case text-stone-400' }, `(${col.unit})`),
  ));
  const headerRow = React.createElement(
    'tr',
    null,
    React.createElement('th', { className: 'w-28 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-500' }, 'Month'),
    ...headerCells,
    React.createElement(
      'th',
      { className: 'w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-500' },
      'Evidence',
    ),
  );

  return React.createElement(
    'div',
    { className: 'overflow-x-auto rounded-lg border border-stone-200 bg-white', 'data-testid': 'monthly-emissions-ledger' },
    React.createElement(
      'table',
      { className: 'w-full text-sm' },
      React.createElement('thead', { className: 'hidden border-b border-stone-200 bg-stone-50 lg:table-header-group' }, headerRow),
      React.createElement('tbody', { className: 'divide-y divide-stone-200' }, rows),
    ),
  );
};

// Import volume unit helper
import { isVolumeUnit } from '../../../../../../utils/helpers/unit-utils';
import { getUnitDenominator, isQuantityField, resolveDensityRequirement } from '../../utils/unitHelpers';
import { normalizeProcessTemplateMonthlyField } from '../../utils/processTemplateMonthlyFields';
import { buildNativeOptionsHtml } from '../../utils/nativeSelectOptions';
import { getFieldUnits } from '../DynamicFieldRenderer';
import {
  GHG_FIELD_OPTION_KEYS,
  resolveStandardGhgFieldOptions,
} from '../../../../config/standardGhgFormConfig';

// Import FlightDetailsSection for C6 air travel per-month airport selection
import { FlightDetailsSection } from '../../../../../../components/FlightDetailsSection';
import { ReportingPeriodControls } from '../ReportingPeriodControls';

const DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS = resolveStandardGhgFieldOptions();

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
  customFugitiveQuantityUnits = [],
  selectedFuel,
  centralizedUnits,
  defaultUnit,
  allowedUnits,
  requiresSubcategory,
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
  const isFugitiveCustomFuel = useCustomFuel && String(category || '').toLowerCase().includes('fugitive');
  const customFuelQuantityUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT]
    || DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT];
  const customQuantityUnitOptions = isFugitiveCustomFuel && customFugitiveQuantityUnits.length > 0
    ? customFugitiveQuantityUnits
    : customFuelQuantityUnits;
  const normalizedProcessTemplateFields = useMemo(() => (
    isProcessEmissions && selectedTemplate?.input_fields?.length
      ? selectedTemplate.input_fields.map(normalizeProcessTemplateMonthlyField)
      : []
  ), [isProcessEmissions, selectedTemplate]);
  const resolveFieldUnits = (field) => {
    if (!field) return [];
    if (field.source === 'process_template') return field.allowedUnits || [];
    return getFieldUnits({
      field,
      scope,
      scope3Method,
      scope3ActivityId,
      requiresSubcategory,
      selectedFuel,
      filteredScope3Activities,
      centralizedUnits,
      biogenicScopeSelection,
      useCustomFuel,
    });
  };
  const runtimeConversionFields = isProcessEmissions && normalizedProcessTemplateFields.length > 0
    ? normalizedProcessTemplateFields
    : dynamicInputFields;
  const supportsRuntimeDensity = isProcessEmissions || useCustomFuel;

  useEffect(() => {
    if (!['using_heat_basis_ncv', 'using_qty_basis_ef', 'using_carbon_composition'].includes(calculationMethodology)) return;

    const quantityField = runtimeConversionFields.find((field) => isQuantityField(field));
    const referenceField = calculationMethodology === 'using_heat_basis_ncv'
      ? runtimeConversionFields.find(isCvField)
      : calculationMethodology === 'using_qty_basis_ef'
        ? runtimeConversionFields.find(isEfField)
        : runtimeConversionFields.find(isCarbonContentField);
    if (!quantityField || !referenceField) return;

    setMonthlyData((previousMonths) => {
      let changed = false;
      const nextMonths = { ...previousMonths };
      activeMonths.forEach((monthKey) => {
        const current = previousMonths[monthKey] || {};
        // Unit-based runtime Density is exclusively a Process Emissions and
        // Custom Fuel concern. Clear a stale requirement if a user switches
        // back to a standard fuel/category.
        if (!supportsRuntimeDensity) {
          if (current.runtime_density_required) {
            nextMonths[monthKey] = {
              ...current,
              runtime_density_required: false,
            };
            changed = true;
          }
          return;
        }
        const quantityUnit = resolveEffectiveFieldUnit({
          field: quantityField,
          data: current,
          selectedFuel,
          fieldUnits: resolveFieldUnits(quantityField),
          isProcessEmissions,
        });
        const referenceUnit = resolveEffectiveFieldUnit({
          field: referenceField,
          data: current,
          selectedFuel,
          fieldUnits: resolveFieldUnits(referenceField),
          isProcessEmissions,
        });
        const requirement = resolveDensityRequirement({
          quantityUnit,
          referenceUnit: calculationMethodology === 'using_carbon_composition'
            ? 'kg'
            : getUnitDenominator(referenceUnit),
          centralizedUnits,
        });
        const hasDensityInputs = hasDensitySourceValues({
          quantityField,
          referenceField,
          data: current,
        });
        if (!requirement.required || !hasDensityInputs) {
          if (current.runtime_density_required && !current.density) {
            nextMonths[monthKey] = {
              ...current,
              override_density: false,
              runtime_density_required: false,
            };
            changed = true;
          }
          return;
        }
        if (current.override_density === true && current.density_unit === requirement.densityUnit) return;
        nextMonths[monthKey] = {
          ...current,
          override_density: true,
          runtime_density_required: true,
          density_unit: requirement.densityUnit,
        };
        changed = true;
      });
      return changed ? nextMonths : previousMonths;
    });
  }, [activeMonths, calculationMethodology, centralizedUnits, monthlyData, runtimeConversionFields, setMonthlyData, supportsRuntimeDensity]);

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

          {(() => {
            const ledgerColumns = deriveLedgerColumns(
              dynamicInputFields,
              formConfig,
              isProcessEmissions,
              selectedTemplate,
              useCustomFuel,
              calculationMethodology,
              isFugitiveCustomFuel,
            );
            const totalCols = ledgerColumns.length + 2; // Month + fields + Evidence

            // Compact cell input renderer — no labels, just input + unit
            const renderCellInput = (col, monthKey, data) => {
              // Process emissions path
              if (isProcessEmissions && selectedTemplate) {
                const field = normalizedProcessTemplateFields.find((candidate) => candidate.valueKey === col.key);
                if (!field) return null;
                const fieldUnits = resolveFieldUnits(field);
                const displayedUnit = resolveEffectiveFieldUnit({
                  field,
                  data,
                  selectedFuel,
                  fieldUnits,
                  isProcessEmissions: true,
                });
                return (
                  <div className="flex items-center gap-1">
                    <Input
                      type={field.data_type === 'number' ? 'number' : 'text'}
                      step={field.data_type === 'number' ? 'any' : undefined}
                      min="0"
                      placeholder="—"
                      value={getMonthlyFieldValue(field, data) || ''}
                      onChange={(e) => updateMonthData(monthKey, field.valueKey, e.target.value)}
                      className="h-8 w-full text-sm"
                      data-testid={`month-${monthKey}-${field.valueKey}`}
                    />
                    {fieldUnits.length > 0 && (
                      <select
                        value={fieldUnits.find((unit) => unit.toLowerCase() === displayedUnit.toLowerCase()) || fieldUnits[0]}
                        onChange={(e) => updateMonthData(monthKey, field.unitKey, e.target.value)}
                        className="h-8 min-w-[4.5rem] shrink-0 rounded border border-stone-200 bg-transparent px-1 text-xs outline-none"
                        data-testid={`month-${monthKey}-${field.valueKey}-unit`}
                        dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldUnits) }}
                      />
                    )}
                  </div>
                );
              }

              if (col.customFuelField) {
                const quantityUnit = data.custom_qty_unit || customFuelQtyUnit || customFuelQuantityUnits[0] || 'kg';
                const referenceUnit = calculationMethodology === 'using_heat_basis_ncv'
                  ? (data.custom_cv_unit || 'TJ/kg').split('/')[1] || 'kg'
                  : calculationMethodology === 'using_qty_basis_ef'
                    ? (data.custom_ef_unit || 'kgCO2/kg').split('/')[1] || 'kg'
                    : 'kg';
                const densityRequirement = resolveDensityRequirement({
                  quantityUnit,
                  referenceUnit,
                  centralizedUnits,
                });
                const sharedInputClass = 'h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0';
                const sharedSelectClass = 'h-8 min-w-[4.5rem] shrink-0 border-0 border-l border-l-stone-200 bg-transparent px-1 text-xs outline-none';

                if (col.customFuelField === 'density') {
                  if (!densityRequirement.required) {
                    return <span className="text-xs text-stone-400" data-testid={`month-${monthKey}-custom-density-not-required`}>—</span>;
                  }
                  return (
                    <div className="flex overflow-hidden rounded border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="—"
                        value={data.density || ''}
                        onChange={(event) => {
                          updateMonthData(monthKey, 'density', event.target.value);
                          updateMonthData(monthKey, 'density_unit', densityRequirement.densityUnit);
                        }}
                        className={sharedInputClass}
                        data-testid={`month-${monthKey}-custom-density`}
                      />
                      <span className="flex h-8 min-w-[4.5rem] items-center border-l border-l-stone-200 bg-stone-50 px-1 text-xs text-stone-600" data-testid={`month-${monthKey}-custom-density-unit`}>
                        {densityRequirement.densityUnit}
                      </span>
                    </div>
                  );
                }

                const fieldConfig = {
                  'emission-factor': {
                    value: data.custom_ef || '',
                    valueKey: 'custom_ef',
                    unit: data.custom_ef_unit || (calculationMethodology === 'using_heat_basis_ncv' ? 'tCO2/TJ' : 'kgCO2/kg'),
                    unitKey: 'custom_ef_unit',
                    units: calculationMethodology === 'using_heat_basis_ncv'
                      ? fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_EF_UNIT] || DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_EF_UNIT]
                      : fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QTY_EF_UNIT] || DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QTY_EF_UNIT],
                  },
                  'calorific-value': {
                    value: data.custom_cv || '',
                    valueKey: 'custom_cv',
                    unit: data.custom_cv_unit || 'TJ/kg',
                    unitKey: 'custom_cv_unit',
                    units: fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_CV_UNIT] || DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_CV_UNIT],
                  },
                  'carbon-content': { value: data.custom_carbon_content || '', valueKey: 'custom_carbon_content' },
                  'oxidation-factor': { value: data.custom_oxidation_factor || '', valueKey: 'custom_oxidation_factor' },
                }[col.customFuelField];

                return (
                  <div className={fieldConfig.units ? 'flex overflow-hidden rounded border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100' : ''}>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="—"
                      value={fieldConfig.value}
                      onChange={(event) => updateMonthData(monthKey, fieldConfig.valueKey, event.target.value)}
                      className={fieldConfig.units ? sharedInputClass : 'h-8 w-full text-sm'}
                      data-testid={`month-${monthKey}-${fieldConfig.valueKey}`}
                    />
                    {fieldConfig.units && (
                      <select
                        value={fieldConfig.unit}
                        onChange={(event) => updateMonthData(monthKey, fieldConfig.unitKey, event.target.value)}
                        className={sharedSelectClass}
                        data-testid={`month-${monthKey}-${fieldConfig.unitKey}`}
                        dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldConfig.units) }}
                      />
                    )}
                  </div>
                );
              }

              // Dynamic fields path
              if (formConfig && dynamicInputFields.length > 0) {
                const field = dynamicInputFields.find(f => f.variable === col.key);
                if (!field) return null;

                const isFugitiveGwpField = isFugitiveCustomFuel && field.variable === 'co2_gwp_fugitives';
                const isOverrideOrOptional = !isFugitiveGwpField
                  && (field.isOverride || (!field.required && !field.isOverride));
                const overrideKey = `override_${field.variable}`;
                const isEnabled = !isOverrideOrOptional || data[overrideKey];
                const defaultValue = getFieldDefaultValue(field, selectedFuel);
                const storedValue = data[field.variable] ?? data[field.fieldKey] ?? '';
                const displayedValue = hasFieldValue(storedValue) ? storedValue : defaultValue;
                const renderOverrideToggle = () => (
                  <label
                    className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] font-medium text-amber-700"
                    title={`Override the default ${field.label.toLowerCase()}`}
                    data-testid={`override-toggle-${field.fieldKey}-${monthKey}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!data[overrideKey]}
                      onChange={(e) => {
                        updateMonthData(monthKey, overrideKey, e.target.checked);
                        if (!e.target.checked) {
                          updateMonthData(monthKey, field.variable, '');
                          updateMonthData(monthKey, `${field.variable}_unit`, '');
                        }
                      }}
                      className="h-3 w-3 rounded border-amber-300 text-amber-600"
                      data-testid={`override-${field.fieldKey}-${monthKey}`}
                    />
                    Override
                  </label>
                );

                // Select field type
                if (field.fieldType === 'select' && field.options?.length > 0) {
                  return (
                    <div className="flex h-8 items-center gap-1">
                      {isOverrideOrOptional && renderOverrideToggle()}
                      <select
                        value={displayedValue}
                        onChange={(e) => updateMonthData(monthKey, field.variable, e.target.value)}
                        disabled={!isEnabled}
                        className={`h-8 min-w-0 flex-1 rounded border border-stone-200 bg-transparent px-2 text-sm outline-none ${!isEnabled ? 'bg-stone-50 text-stone-600' : ''}`}
                        data-testid={`select-${field.fieldKey}-${monthKey}`}
                        dangerouslySetInnerHTML={{
                          __html: buildNativeOptionsHtml(field.options, {
                            placeholder: `Select`,
                            getValue: (option) => option.value || option,
                            getLabel: (option) => option.label || option,
                          }),
                        }}
                      />
                    </div>
                  );
                }

                const fieldUnits = getFieldUnits({
                  field, scope, scope3Method, scope3ActivityId,
                  requiresSubcategory, selectedFuel, filteredScope3Activities,
                  centralizedUnits, biogenicScopeSelection, useCustomFuel,
                });
                const isNoUnitField = field.unitSource === 'none';
                const isTextUnitField = field.unitSource === 'text';
                const isSupplierBasis = scope3Method === 'supplier_basis';
                const isQtyField = isQuantityField(field);
                const hideUnit = useCustomFuel && isQtyField;
                const showCustomFuelQuantityUnit = useCustomFuel && isQtyField;
                const showUnitDropdown = showCustomFuelQuantityUnit
                  || (!hideUnit && !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis);
                const showTextUnit = !hideUnit && !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                const defaultUnitValue = getFieldDefaultUnit(field, selectedFuel, fieldUnits);
                const displayedUnit = resolveEffectiveFieldUnit({
                  field,
                  data,
                  selectedFuel,
                  fieldUnits,
                  isProcessEmissions,
                });

                return (
                  <div className="flex h-8 items-center gap-1">
                    {isOverrideOrOptional && renderOverrideToggle()}
                    <div className={`flex min-w-0 flex-1 items-center gap-1 ${!isEnabled ? 'pointer-events-none' : ''}`}>
                      <Input
                        type={field.fieldType === 'text' ? 'text' : 'number'}
                        step={field.fieldType === 'number' ? 'any' : undefined}
                        min={field.fieldType === 'number' ? '0' : undefined}
                        placeholder="—"
                        value={displayedValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (field.validationRules?.max !== undefined && val !== '' && parseFloat(val) > field.validationRules.max) {
                            toast.error(`${field.label} cannot exceed ${field.validationRules.max}`);
                            return;
                          }
                          if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
                            updateMonthData(monthKey, field.variable, val);
                          }
                        }}
                        onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
                        disabled={!isEnabled}
                        className={`h-8 w-full text-sm ${!isEnabled ? 'border-stone-200 bg-stone-50 text-stone-600' : ''}`}
                        data-testid={`input-${field.fieldKey}-${monthKey}`}
                      />
                      {showUnitDropdown && (
                        <select
                          value={(() => {
                            if (showCustomFuelQuantityUnit) {
                              return data.custom_qty_unit || customFuelQtyUnit || customQuantityUnitOptions[0] || '';
                            }
                            return fieldUnits.find(u => u.toLowerCase() === displayedUnit.toLowerCase()) || fieldUnits[0];
                          })()}
                          onChange={(e) => {
                            if (showCustomFuelQuantityUnit) {
                              updateMonthData(monthKey, 'custom_qty_unit', e.target.value);
                            }
                            updateMonthData(monthKey, `${field.variable}_unit`, e.target.value);
                            if (isQtyField && !isProcessEmissions) updateMonthData(monthKey, 'unit', e.target.value);
                          }}
                          disabled={!isEnabled}
                          className={`h-8 min-w-[4.5rem] shrink-0 rounded border border-stone-200 bg-transparent px-1 text-xs outline-none ${!isEnabled ? 'bg-stone-50 text-stone-600' : ''}`}
                          data-testid={showCustomFuelQuantityUnit ? `month-${monthKey}-custom-qty-unit` : `unit-${field.fieldKey}-${monthKey}`}
                          dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(showCustomFuelQuantityUnit ? customQuantityUnitOptions : fieldUnits) }}
                        />
                      )}
                      {showTextUnit && (
                        <Input
                          type="text"
                          placeholder="unit"
                          value={displayedUnit}
                          onChange={(e) => updateMonthData(monthKey, `${field.variable}_unit`, e.target.value)}
                          disabled={!isEnabled}
                          className={`h-8 w-16 shrink-0 text-xs ${!isEnabled ? 'border-stone-200 bg-stone-50 text-stone-600' : ''}`}
                          data-testid={`unit-text-${field.fieldKey}-${monthKey}`}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Legacy quantity path
              return (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="—"
                    value={data.quantity || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || parseFloat(val) >= 0) updateMonthData(monthKey, 'quantity', val);
                    }}
                    onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                    className="h-8 w-full text-sm"
                    data-testid={`month-${monthKey}-quantity`}
                  />
                  <select
                    value={useCustomFuel ? (data.custom_qty_unit || customFuelQtyUnit || customQuantityUnitOptions[0] || '') : (data.unit || defaultUnit)}
                    onChange={(e) => {
                      if (useCustomFuel) updateMonthData(monthKey, 'custom_qty_unit', e.target.value);
                      updateMonthData(monthKey, 'unit', e.target.value);
                    }}
                    className="h-8 min-w-[4.5rem] shrink-0 rounded border border-stone-200 bg-transparent px-1 text-xs outline-none"
                    data-testid={useCustomFuel ? `month-${monthKey}-custom-qty-unit` : `month-${monthKey}-unit`}
                    dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(useCustomFuel ? customQuantityUnitOptions : allowedUnits) }}
                  />
                </div>
              );
            };

            const ledgerRows = activeMonths.map(month => {
                  const monthKey = month.key;
                  const status = getMonthStatus(monthKey);
                  const data = monthlyData[monthKey] || {};
                  const isDisabled = isFutureMonth(monthKey, reportingYear, reportingYearType);
                  const displayYear = getActualYearForMonth(monthKey);

                  const hasFlightDetails = !isDisabled && scope3ActivityType === 'air_travel' && capabilities.flightDetails;
                  const hasCustomFuel = !isDisabled && useCustomFuel;
                  const quantityField = runtimeConversionFields.find((field) => isQuantityField(field));
                  const referenceField = calculationMethodology === 'using_heat_basis_ncv'
                    ? runtimeConversionFields.find(isCvField)
                    : calculationMethodology === 'using_qty_basis_ef'
                      ? runtimeConversionFields.find(isEfField)
                      : runtimeConversionFields.find(isCarbonContentField);
                  const quantityUnit = resolveEffectiveFieldUnit({
                    field: quantityField,
                    data,
                    selectedFuel,
                    fieldUnits: resolveFieldUnits(quantityField),
                    isProcessEmissions,
                  });
                  const referenceUnit = resolveEffectiveFieldUnit({
                    field: referenceField,
                    data,
                    selectedFuel,
                    fieldUnits: resolveFieldUnits(referenceField),
                    isProcessEmissions,
                  });
                  const dynamicDensityRequirement = resolveDensityRequirement({
                    quantityUnit,
                    referenceUnit: calculationMethodology === 'using_carbon_composition'
                      ? 'kg'
                      : getUnitDenominator(referenceUnit),
                    centralizedUnits,
                  });
                  const hasDensityInputs = hasDensitySourceValues({
                    quantityField,
                    referenceField,
                    data,
                  });
                  const hasDynamicDensity = !isDisabled
                    && isProcessEmissions
                    && hasDensityInputs
                    && dynamicDensityRequirement.required;
                  const hasLegacyOverrides = !isDisabled && !formConfig && (scope === 'scope1' || scope === 'biogenic') &&
                    !useCustomFuel && selectedFuel && capabilities.manualFactorOverrides;
                  const hasScope2Override = !isDisabled && !formConfig && scope === 'scope2' && !useCustomFuel;
                  const hasExpandableContent = hasFlightDetails || hasDynamicDensity || hasLegacyOverrides || hasScope2Override;
                  const monthCell = (
                    <td className="whitespace-nowrap px-3 py-3 align-middle" data-testid={`month-${monthKey}-ledger-month`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${
                          isDisabled ? 'bg-stone-200' : status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                        }`} />
                        <div>
                          <p className={`text-sm font-medium ${isDisabled ? 'text-stone-400' : 'text-stone-800'}`}>
                            {month.name} {displayYear}
                          </p>
                          {isDisabled && <span className="text-xs text-stone-400">Future</span>}
                        </div>
                      </div>
                    </td>
                  );
                  const dataCells = isDisabled ? [
                    <td key="future-notice" colSpan={ledgerColumns.length + 1} className="px-3 py-3 text-sm text-stone-400" data-testid={`month-${monthKey}-future-notice`}>
                      This period is not available yet.
                    </td>,
                  ] : [
                    ...ledgerColumns.map((col) => (
                      <td key={col.key} className="px-2 py-3 align-middle" data-testid={`month-${monthKey}-field-${col.key}`}>
                        {renderCellInput(col, monthKey, data)}
                      </td>
                    )),
                    <td key="evidence" className="px-2 py-3 align-middle">
                      <EvidenceIconCell
                        monthKey={monthKey}
                        evidences={data.evidences}
                        handleEvidenceUpload={handleEvidenceUpload}
                        removeEvidence={removeEvidence}
                        backendUrl={BACKEND_URL}
                      />
                    </td>,
                  ];
                  const mainRow = React.createElement(
                    'tr',
                    { className: isDisabled ? 'bg-stone-50/70 opacity-60' : '', 'data-testid': `month-${monthKey}-ledger-row` },
                    monthCell,
                    ...dataCells,
                  );

                  return (
                    <React.Fragment key={monthKey}>
                      {mainRow}

                      {hasCustomFuel && (
                        <CustomFuelMonthFields
                          monthKey={monthKey}
                          data={data}
                          updateMonthData={updateMonthData}
                          calculationMethodology={calculationMethodology}
                          fieldOptions={fieldOptions}
                          centralizedUnits={centralizedUnits}
                          renderFields={false}
                          isFugitiveCustomFuel={isFugitiveCustomFuel}
                        />
                      )}

                      {/* ── Expandable content row (flight details, custom fuel, additional details, overrides) ── */}
                      {hasExpandableContent && (
                        <tr data-testid={`month-${monthKey}-extra-row`}>
                          <td colSpan={totalCols} className="px-5 pb-4 pt-0">
                            <div className="space-y-4">
                              {/* Flight Details — C6 air_travel */}
                              {hasFlightDetails && (
                                <FlightDetailsSection
                                  monthKey={monthKey}
                                  data={data}
                                  updateMonthData={updateMonthData}
                                  disabled={isDisabled}
                                />
                              )}

                              {hasDynamicDensity && (
                                <div className="grid max-w-md grid-cols-[1fr_auto] items-end gap-2" data-testid={`month-${monthKey}-dynamic-density-field`}>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Density <span className="text-red-500">*</span></Label>
                                    <Input
                                      type="number"
                                      step="any"
                                      min="0"
                                      required
                                      value={data.density || ''}
                                      onChange={(event) => {
                                        updateMonthData(monthKey, 'density', event.target.value);
                                        updateMonthData(monthKey, 'density_unit', dynamicDensityRequirement.densityUnit);
                                        updateMonthData(monthKey, 'override_density', true);
                                        updateMonthData(monthKey, 'runtime_density_required', true);
                                      }}
                                      className="h-9 bg-white"
                                      data-testid={`month-${monthKey}-dynamic-density-input`}
                                    />
                                  </div>
                                  <span className="mb-2 text-sm text-stone-600" data-testid={`month-${monthKey}-dynamic-density-unit`}>
                                    {dynamicDensityRequirement.densityUnit}
                                  </span>
                                  <p className="col-span-2 text-xs text-amber-700" data-testid={`month-${monthKey}-dynamic-density-conversion-hint`}>
                                    Conversion required: {quantityUnit} → {calculationMethodology === 'using_carbon_composition' ? 'kg' : getUnitDenominator(referenceUnit)}
                                  </p>
                                </div>
                              )}

                              {/* Legacy Scope 1 / Biogenic overrides */}
                              {hasLegacyOverrides && (
                                <details className="group" data-testid={`month-${monthKey}-fuel-additional-details`}>
                                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-stone-700 transition-colors hover:text-emerald-700" data-testid={`month-${monthKey}-fuel-additional-details-trigger`}>
                                    <span className="transition-transform duration-200 group-open:rotate-90">▸</span>
                                    Additional details
                                  </summary>
                                  <div className="mt-3 space-y-6 border-l-2 border-amber-200 pl-4" data-testid={`month-${monthKey}-fuel-additional-details-content`}>
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
                                        <span>Calorific Value (if available) <span className="text-gray-500">({selectedFuel?.calorific_value_unit})</span></span>
                                      </label>
                                      {data.overrideCalorificValue && (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          <Input type="number" step="any" min="0" placeholder="Enter value" value={data.calorificValue || ''} onChange={(e) => { const val = e.target.value; if (val === '' || parseFloat(val) >= 0) updateMonthData(monthKey, 'calorificValue', val); }} onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }} className="bg-white" required data-testid={`month-${monthKey}-calorific-value-input`} />
                                          <Input placeholder="Justifications/Comments *" value={data.calorificValueJustification || ''} onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)} className="bg-white" required data-testid={`month-${monthKey}-calorific-value-justification-input`} />
                                        </div>
                                      )}
                                    </div>
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
                                          <span>Density Value (if available) <span className="text-gray-500">({selectedFuel?.density_unit})</span></span>
                                        </label>
                                        {data.overrideDensity && (
                                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <Input type="number" step="any" min="0" placeholder="Enter value" value={data.density || ''} onChange={(e) => { const val = e.target.value; if (val === '' || parseFloat(val) >= 0) updateMonthData(monthKey, 'density', val); }} onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }} className="bg-white" required data-testid={`month-${monthKey}-density-input`} />
                                            <Input placeholder="Justifications/Comments *" value={data.densityJustification || ''} onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)} className="bg-white" required data-testid={`month-${monthKey}-density-justification-input`} />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </details>
                              )}

                              {/* Scope 2 custom EF override */}
                              {hasScope2Override && (
                                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                                  <div className="flex items-center gap-2">
                                    <input type="checkbox" id={`custom-ef-${monthKey}`} checked={data.useCustomEmissionFactor || false} onChange={(e) => updateMonthData(monthKey, 'useCustomEmissionFactor', e.target.checked)} />
                                    <label htmlFor={`custom-ef-${monthKey}`} className="text-sm font-medium text-blue-800">Use Custom Emission Factor</label>
                                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-600">Unit: tCO₂/MWh</span>
                                  </div>
                                  {data.useCustomEmissionFactor && (
                                    <div className="ml-6 space-y-2">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-xs text-blue-700">Custom EF (tCO₂/MWh)</label>
                                          <Input type="number" step="any" placeholder="e.g., 0.5" value={data.customEmissionFactor || ''} onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)} className="bg-white" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-xs text-blue-700">Justification/Comments <span className="text-red-500">*</span></label>
                                          <Input placeholder="Justification/Comments" value={data.customEmissionFactorSource || ''} onChange={(e) => updateMonthData(monthKey, 'customEmissionFactorSource', e.target.value)} className="bg-white" />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                });

            return <MonthlyLedger columns={ledgerColumns} rows={ledgerRows} />;
          })()}
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
          customFugitiveQuantityUnits={customFugitiveQuantityUnits}
          customFuelQtyUnit={customFuelQtyUnit}
          calculationMethodology={calculationMethodology}
          isFugitiveCustomFuel={isFugitiveCustomFuel}
          handleEvidenceUpload={handleEvidenceUpload}
          removeEvidence={removeEvidence}
          backendUrl={BACKEND_URL}
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
  customFugitiveQuantityUnits,
  customFuelQtyUnit,
  calculationMethodology,
  isFugitiveCustomFuel,
  handleEvidenceUpload,
  removeEvidence,
  backendUrl,
}) => {
  const customFuelQuantityUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT]
    || DEFAULT_CUSTOM_FUEL_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT];
  const customQuantityUnitOptions = isFugitiveCustomFuel && customFugitiveQuantityUnits.length > 0
    ? customFugitiveQuantityUnits
    : customFuelQuantityUnits;
  // Process Emissions Carbon Composition formulas operate on mass. Custom Fuel
  // renders its conditional Density field through CustomFuelMonthFields.
  const isCarbonComposition = calculationMethodology === 'using_carbon_composition';
  const quantityField = dynamicInputFields.find(isQuantityField);
  const carbonContentField = dynamicInputFields.find(isCarbonContentField);
  const quantityUnit = yearlyData[`${quantityField?.variable}_unit`]
    || yearlyData[`${quantityField?.fieldKey}_unit`]
    || quantityField?.defaultUnit
    || quantityField?.default_unit
    || quantityField?.expectedUnit
    || quantityField?.allowedUnits?.[0]
    || '';
  const yearlyDensityRequirement = resolveDensityRequirement({
    quantityUnit,
    referenceUnit: isCarbonComposition ? 'kg' : '',
    centralizedUnits,
  });
  const showYearlyProcessDensity = isProcessEmissions
    && isCarbonComposition
    && hasNumericFieldValue(quantityField, yearlyData)
    && hasNumericFieldValue(carbonContentField, yearlyData)
    && yearlyDensityRequirement.required;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">
          Annual Data for {reportingYearType === 'financial' 
            ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}` 
            : `CY${reportingYear}`}
        </Label>
      </div>

      <div className="space-y-5 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="yearly-process-fields-grid">
            {selectedTemplate.input_fields?.map((field) => (
              <div key={field.key} className="min-w-0 space-y-2">
                <Label className="flex min-h-6 items-center justify-center text-center leading-snug">
                  {field.label} (Annual Total) {!field.is_optional && '*'}
                </Label>
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
            {dynamicInputFields.filter(f => (f.required && !f.isOverride)
              || (isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives')).length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="yearly-required-fields-grid">
                {dynamicInputFields.filter(f => (f.required && !f.isOverride)
                  || (isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives')).map(field => {
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const hideStandardQuantityUnit = useCustomFuel && isQuantityField(field);
                  const showCustomFuelQuantityUnit = useCustomFuel && isQuantityField(field);
                  const isSupplierBasis = scope3Method === 'supplier_basis';
                  const isNoUnitField = field.unitSource === 'none';
                  const isTextUnitField = field.unitSource === 'text';
                  const isUnitlessCountField = isNoUnitField;
                  const showUnitSelector = showCustomFuelQuantityUnit
                    || (!hideStandardQuantityUnit && !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasis);
                  const showUnitTextInput = !hideStandardQuantityUnit && !isNoUnitField && (isTextUnitField || isSupplierBasis) && !field.variable?.endsWith('_unit');
                  
                  return (
                    <div key={field.variable} className="min-w-0">
                      <Label className="mb-2 flex min-h-6 items-center justify-center gap-2 text-center leading-snug">
                        {field.label} <span className="text-red-500">*</span>
                        {field.tooltip && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" aria-label={`${field.label} info`} className="inline-flex text-stone-400 hover:text-emerald-600" data-testid={`yearly-${field.fieldKey || field.variable}-help`}>
                                  <Info className="h-4 w-4" />
                                </button>
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
                          data-testid={`yearly-${field.fieldKey || field.variable}-select`}
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
                            data-testid={`yearly-${field.fieldKey || field.variable}-input`}
                          />
                          {showUnitSelector && (
                            <select
                              value={showCustomFuelQuantityUnit
                                ? (yearlyData.custom_qty_unit || customFuelQtyUnit || customQuantityUnitOptions[0] || '')
                                : (yearlyData[`${field.variable}_unit`] || fieldUnits[0] || '')}
                              onChange={(e) => setYearlyData(prev => ({
                                ...prev,
                                ...(showCustomFuelQuantityUnit ? { custom_qty_unit: e.target.value } : {}),
                                [`${field.variable}_unit`]: e.target.value,
                              }))}
                              className="h-10 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                              data-testid={showCustomFuelQuantityUnit ? 'yearly-custom-qty-unit' : `yearly-${field.fieldKey}-unit`}
                              dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(showCustomFuelQuantityUnit ? customQuantityUnitOptions : fieldUnits) }}
                            />
                          )}
                          {showUnitTextInput && (
                            <Input
                              type="text"
                              placeholder="Unit"
                              value={yearlyData[`${field.variable}_unit`] || ''}
                              onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                              className="h-10 min-w-24 rounded-none border-0 border-l border-l-stone-200 bg-transparent shadow-none focus-visible:ring-0"
                              data-testid={`yearly-${field.fieldKey || field.variable}-unit-text`}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showYearlyProcessDensity && (
              <div className="grid max-w-md grid-cols-[1fr_auto] items-end gap-2" data-testid="yearly-process-density-field">
                <div className="space-y-1">
                  <Label htmlFor="yearly-process-density-input" className="text-sm font-medium">
                    Density <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="yearly-process-density-input"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={yearlyData.density || ''}
                    onChange={(event) => setYearlyData((previous) => ({
                      ...previous,
                      density: event.target.value,
                      density_unit: yearlyDensityRequirement.densityUnit,
                      override_density: true,
                      runtime_density_required: true,
                    }))}
                    className="h-10 bg-white"
                    data-testid="yearly-process-density-input"
                  />
                </div>
                <span className="mb-2 text-sm text-stone-600" data-testid="yearly-process-density-unit">
                  {yearlyDensityRequirement.densityUnit}
                </span>
                <p className="col-span-2 text-xs text-amber-700" data-testid="yearly-process-density-conversion-hint">
                  Conversion required: {quantityUnit} → kg
                </p>
              </div>
            )}

            {/* Optional Inputs Section with Override Toggle */}
            {dynamicInputFields.filter(f => !f.required && !f.isOverride).length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="yearly-optional-fields-grid">
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
                    <div key={field.variable} className="min-w-0 space-y-3">
                      <div className="flex min-h-6 flex-wrap items-center justify-center gap-2 text-center">
                        <Label className="flex items-center gap-2 text-center leading-snug">
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
                          data-testid={`yearly-${field.fieldKey || field.variable}-optional-input`}
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
                            data-testid={`yearly-${field.fieldKey || field.variable}-optional-unit-text`}
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
                centralizedUnits={centralizedUnits}
                isFugitiveCustomFuel={isFugitiveCustomFuel}
              />
            )}
            
            {/* Override Properties Section for Yearly */}
            {dynamicInputFields.filter(f => f.isOverride
              && !(isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives')).length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="yearly-override-fields-grid">
                {dynamicInputFields.filter(f => f.isOverride
                  && !(isFugitiveCustomFuel && f.variable === 'co2_gwp_fugitives')).map(field => {
                  const overrideKey = `override_${field.variable}`;
                  const isOverrideEnabled = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
                  const fieldUnits = getFieldUnitsForYearly(field);
                  const showStandardExpectedUnit = field.expectedUnit && !(useCustomFuel && isQuantityField(field));
                  
                  return (
                    <div key={field.variable} className="min-w-0 space-y-3">
                      <div className="flex min-h-6 flex-wrap items-center justify-center gap-2 text-center">
                        <Label className="flex items-center gap-2 text-center leading-snug">
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
                          data-testid={`yearly-${field.fieldKey || field.variable}-override-input`}
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
                  <select
                    value={useCustomFuel
                      ? (yearlyData.custom_qty_unit || customFuelQtyUnit || customQuantityUnitOptions[0] || '')
                      : (yearlyData.unit || defaultUnit)}
                    onChange={(e) => setYearlyData(prev => ({
                      ...prev,
                      ...(useCustomFuel ? { custom_qty_unit: e.target.value } : {}),
                      unit: e.target.value,
                    }))}
                    className="h-10 min-w-28 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none"
                    data-testid={useCustomFuel ? 'yearly-custom-qty-unit' : 'yearly-unit'}
                    dangerouslySetInnerHTML={{
                      __html: useCustomFuel
                        ? buildNativeOptionsHtml(customQuantityUnitOptions)
                        : buildNativeOptionsHtml(centralizedUnits, {
                          getValue: (unit) => unit.symbol,
                          getLabel: (unit) => `${unit.symbol} (${unit.name})`,
                        }),
                    }}
                  />
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
              centralizedUnits={centralizedUnits}
                isFugitiveCustomFuel={isFugitiveCustomFuel}
              />
            )}

            {/* Show density input if volume unit */}
            {!useCustomFuel && isProcessEmissions && isVolumeUnit(yearlyData.unit || defaultUnit, centralizedUnits) && (
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

        <div className="border-t border-stone-200 pt-5" data-testid="yearly-evidence-field">
          <Label className="mb-2 block">Evidence <span className="text-xs font-normal text-stone-500">(Optional)</span></Label>
          <EvidenceIconCell
            monthKey="yearly"
            evidences={yearlyData.evidences}
            handleEvidenceUpload={handleEvidenceUpload}
            removeEvidence={removeEvidence}
            backendUrl={backendUrl}
            showLabel
          />
        </div>

      </div>
    </div>
  );
};

export default Step3YearMonthlyData;
