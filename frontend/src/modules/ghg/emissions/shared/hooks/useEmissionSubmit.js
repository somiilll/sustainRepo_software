/**
 * useEmissionSubmit — F6 (Option B).
 *
 * Encapsulates the full Save-flow that previously lived inline as
 * `handleSubmit` in EmissionEntryForm.js (617 lines). Returns a single
 * `submit()` function the form can call from its Save button.
 *
 * Strict NO-LOGIC-CHANGE policy — the body was lifted byte-identically;
 * only the closure scope was reified into `ctx` and `setters` arguments.
 *
 * The hook orchestrates:
 *  - C7 multi-employee yearly + monthly create
 *  - Module dispatch via `categoryRegistry` (Scope 1/2 generic + per-category
 *    Scope 3 modules + biogenic + Stationary/Mobile/Fugitive)
 *  - `editingEmission` update path (PUT /emissions/{id})
 *  - Process Emissions branch (POST /emissions with template inputs)
 *  - Final fallback toast for unsupported categories
 *
 * Behaviour byte-identical: validation gate, toast messages, axios endpoints,
 * audit-history persistence, success/error semantics all preserved.
 */
import axios from 'axios';
import { toast } from 'sonner';

import { categoryRegistry } from '../../../../emissions';
import { MONTHS } from '../constants/emission-form-constants';
import { buildCustomFuelCalculationPayload } from '../../../../../pages/emissions/utils/customFuelCalcAdapter';
import { getProcessTemplateFieldUnit } from '../utils/processTemplateMonthlyFields';
import {
  getUnitDenominator,
  isQuantityField,
  resolveDensityRequirement,
} from '../utils/unitHelpers';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const getProvidedDensity = (data = {}) => {
  const value = Number.parseFloat(data.density);
  if (!Number.isFinite(value)) return null;
  return { value, unit: data.density_unit || 'kg/L' };
};

const hasNumericValue = (value) => (
  value !== undefined
  && value !== null
  && value !== ''
  && Number.isFinite(Number.parseFloat(value))
);

const isCvField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(cv|calorific|ncv)(_|$)/i.test(identity)
    || /calorific|\bcv\b|\bncv\b/i.test(field.label || '');
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

const getFieldValue = (data = {}, field = {}) => (
  data[field.variable] ?? data[field.fieldKey]
);

const getFieldUnit = (data = {}, field = {}) => (
  data[`${field.variable}_unit`]
  || data[`${field.fieldKey}_unit`]
  || field.defaultUnit
  || field.default_unit
  || field.expectedUnit
  || field.allowedUnits?.[0]
  || ''
);

/**
 * This intentionally resolves at submit time rather than using the rendered
 * row's asynchronous state flag. The submitted values and units are therefore
 * the sole source of truth for the density requirement.
 */
const resolveProcessDensityRequirement = ({
  data,
  dynamicInputFields = [],
  calculationMethodology,
  centralizedUnits = [],
}) => {
  const quantityField = dynamicInputFields.find(isQuantityField);
  if (!quantityField || !hasNumericValue(getFieldValue(data, quantityField))) {
    return { required: false };
  }

  const quantityUnit = getFieldUnit(data, quantityField);
  const isCarbonComposition = calculationMethodology === 'using_carbon_composition';

  // Prefer the selected methodology, but inspect both supported reference
  // fields if React has not yet synchronized that selector into form state.
  const referenceFields = isCarbonComposition
    ? [dynamicInputFields.find(isCarbonContentField)]
    : calculationMethodology === 'using_heat_basis_ncv'
    ? [dynamicInputFields.find(isCvField)]
    : calculationMethodology === 'using_qty_basis_ef'
      ? [dynamicInputFields.find(isEfField)]
      : [dynamicInputFields.find(isCvField), dynamicInputFields.find(isEfField)];

  for (const referenceField of referenceFields.filter(Boolean)) {
    if (!hasNumericValue(getFieldValue(data, referenceField))) continue;
    const referenceUnit = isCarbonComposition
      ? 'kg'
      : getUnitDenominator(getFieldUnit(data, referenceField));
    const requirement = resolveDensityRequirement({
      quantityUnit,
      referenceUnit,
      centralizedUnits,
    });
    if (requirement.required) return requirement;
  }

  return { required: false };
};

export function useEmissionSubmit(ctx) {
  const submit = async () => {
    const {
      facilityId, scope, category, fuelId,
      useCustomFuel, customFuelName, customEmissionFactor, customSource,
      recordSource,
      isSaving, scope3Method, scope3ActivityId, scope3ActivityType,
      scope3Subcategory, typeOfProduct, scope3CustomActivity, useCustomActivity, biogenicScopeSelection,
      employees, frequencyType, reportingYearType, reportingYear,
      monthlyData, yearlyData, processNames, responsiblePerson,
      responsiblePersonDesignation, responsiblePersonContact, notes, supplierName,
      supplierCode, employeeName, employeeId, assetName,
      fromLocation, toLocation, selectedSubIndustry, selectedTemplate,
      templateInputValues, dynamicCategories, setIsSaving, isC7EmployeeCommuting,
      isProcessEmissions = false, requiresSubcategory, selectedFuel, filteredScope3Activities,
      dynamicInputFields, centralizedUnits, defaultUnit, canProceedToStep, getAuthHeader,
      onSuccess, getActualYearForMonth, evaluateFormula,
      buildDecisionInputs, editingEmission,
      decisionFieldValues,
      capabilities,
      // Optional supplier context
      supplierContext = null,
      // OCR context for finalize-import
      ocrPrefillData = null,
    } = ctx;
    
    // Helper to finalize OCR import after successful emission save
    const finalizeOcrImport = async (emissionRecordIds) => {
      if (!ocrPrefillData?.line_item_id) return;
      
      try {
        console.log('[OCR Finalize] Calling finalize-import with:', {
          line_item_id: ocrPrefillData.line_item_id,
          emission_record_ids: emissionRecordIds
        });
        
        await axios.post(`${API}/ocr-invoice/finalize-import`, {
          line_item_id: ocrPrefillData.line_item_id,
          emission_record_ids: emissionRecordIds
        }, { headers: getAuthHeader() });
        
        console.log('[OCR Finalize] Successfully finalized OCR import');
      } catch (err) {
        console.error('[OCR Finalize] Failed to finalize import:', err);
        // Don't show error to user - emission was saved successfully
      }
    };
    
    // Use supplier API endpoint if in supplier context
    const apiBase = supplierContext 
      ? `${API}/supplier-assessment/my-assessment/emissions`
      : `${API}/emissions`;

    // Link a calc-engine audit log entry to a newly created emission record.
    // Best-effort: failures are logged but never block the save flow.
    const linkAuditLog = async (auditLogId, emissionRecordId) => {
      if (!auditLogId || !emissionRecordId) return;
      try {
        await axios.post(`${API}/calc-engine/audit-log/link-emission`, {
          audit_log_id: auditLogId,
          emission_record_id: emissionRecordId,
        }, { headers: getAuthHeader() });
      } catch (err) {
        console.warn('[useEmissionSubmit] Failed to link audit log:', err);
      }
    };

    // Prevent duplicate submissions
    if (isSaving) return;
    
    const validation = canProceedToStep(5); // Final validation
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    // Process Emissions density is a virtual, conditional field. Resolve its
    // requirement from the exact values about to be persisted so a stale UI
    // effect cannot allow the calculation engine to use a default factor.
    const isProcessCategory = isProcessEmissions
      || category?.trim().toLowerCase() === 'process emissions';
    if (isProcessCategory) {
      const rowsToValidate = frequencyType === 'yearly'
        ? [['yearly', yearlyData]]
        : Object.entries(monthlyData || {});
      for (const [periodKey, data] of rowsToValidate) {
        const requirement = resolveProcessDensityRequirement({
          data,
          dynamicInputFields,
          calculationMethodology: decisionFieldValues?.calculation_methodology
            || data?.calculation_methodology
            || buildDecisionInputs?.(data)?.calculation_methodology,
          centralizedUnits,
        });
        if (!requirement.required) continue;

        const density = getProvidedDensity(data);
        if (!density || density.value <= 0 || density.unit !== requirement.densityUnit) {
          const monthName = periodKey === 'yearly'
            ? 'the annual entry'
            : (MONTHS.find((month) => month.key === periodKey)?.name || periodKey);
          toast.error(`Please enter Density (${requirement.densityUnit}) for ${monthName}`);
          return;
        }
      }
    }

    setIsSaving(true); // Disable button immediately

    // Shared module-resolution helper (used by both monthly & yearly dispatch).
    // Returns the active category module (with `buildCreatePayload`) or null
    // if the scope/category combo is not yet wired through the registry.
    const resolveDispatchModule = () => {
      const cat = (category || '').toLowerCase();
      let mod = null;
      if (scope === 'scope3') {
        const codeMatch = cat.match(/^(c\d+)/);
        if (!codeMatch) return null;
        if (codeMatch[1] === 'c7') return null; // C7 has its own dedicated branch
        mod = categoryRegistry.get(codeMatch[1]);
      } else if (scope === 'scope1') {
        if (cat.includes('stationary')) mod = categoryRegistry.get('stationary_combustion');
        else if (cat.includes('mobile')) mod = categoryRegistry.get('mobile_combustion');
        else if (cat.includes('fugitive')) mod = categoryRegistry.get('fugitive_emissions');
        else mod = categoryRegistry.getGenericModule?.('scope1');
      } else if (scope === 'scope2') {
        mod = categoryRegistry.getGenericModule?.('scope2');
      } else if (scope === 'biogenic') {
        if (biogenicScopeSelection === 'scope3') {
          const codeMatch = cat.match(/^(c\d+)/);
          if (codeMatch && codeMatch[1] === 'c7') return null;
          mod = categoryRegistry.getGenericModule?.('scope3');
        } else if (biogenicScopeSelection === 'scope1') {
          mod = categoryRegistry.getGenericModule?.('scope1');
        }
      }
      return mod?.buildCreatePayload ? mod : null;
    };

    try {
      const validProcesses = processNames.filter(p => p.name && p.name.trim() !== '');
      
      // ===========================================
      // C7 EMPLOYEE COMMUTING HANDLING (Phase F: module dispatch)
      // ===========================================
      // Multi-employee yearly + monthly CREATE flow.
      // Logic lives in /modules/emissions/categories/C7EmployeeCommuting/create.js
      // Dedicated endpoints: /api/emissions/c7/yearly and /api/emissions/c7/month
      if (isC7EmployeeCommuting && employees.length > 0) {
        const c7Module = categoryRegistry.get('c7');
        if (!c7Module?.buildCreatePayload) {
          toast.error('C7 module not registered. Please reload the page.');
          setIsSaving(false);
          return;
        }

        const c7Ctx = {
          employees,
          frequencyType,
          facilityId,
          reportingYearType,
          reportingYear,
          scope3Method,
          scope3ActivityId,
          scope3ActivityType,
          scope3CustomActivity,
          useCustomActivity,
          filteredScope3Activities,
          notes,
          responsiblePerson,
          responsiblePersonDesignation,
          responsiblePersonContact,
          processNames,
          validProcesses,
          getActualYearForMonth,
        };

        // 1. Module-owned validation (employee names + per-mode data presence + calc check)
        const c7Validation = c7Module.validateCreateSubmission(c7Ctx);
        if (!c7Validation.valid) {
          toast.error(c7Validation.errorMessage);
          setIsSaving(false);
          return;
        }

        // 2. Module-owned payload construction (yearly: single payload, monthly: list of payloads)
        const c7Built = c7Module.buildCreatePayload(null, c7Ctx);

        // 3. POST + UI semantics (kept here — orchestration responsibility of the page/form)
        if (c7Built.mode === 'yearly') {
          try {
            await axios.post(`${API}${c7Built.endpoint}`, c7Built.payload, {
              headers: getAuthHeader(),
            });
            toast.success(`Created yearly C7 Employee Commuting record for ${c7Built.reportingPeriod}`);
            onSuccess?.();
          } catch (error) {
            console.error('Error saving yearly C7 emission:', error);
            const detail = error.response?.data?.detail;
            const errorMsg = Array.isArray(detail)
              ? detail.map((e) => e.msg || e.message || JSON.stringify(e)).join(', ')
              : (typeof detail === 'string' ? detail : 'Failed to save yearly C7 emission');
            toast.error(errorMsg);
          } finally {
            setIsSaving(false);
          }
          return;
        }

        // monthly: post each month-payload sequentially
        if (!c7Built.payloads || c7Built.payloads.length === 0) {
          toast.error('No valid monthly data to save');
          setIsSaving(false);
          return;
        }

        let successCount = 0;
        let totalCo2e = 0;
        const errors = [];
        for (const { monthKey, monthCo2e, payload } of c7Built.payloads) {
          totalCo2e += monthCo2e;
          try {
            await axios.post(`${API}${c7Built.endpoint}`, payload, {
              headers: getAuthHeader(),
            });
            successCount++;
          } catch (err) {
            console.error(`[C7] Failed to save ${monthKey}:`, err);
            errors.push(monthKey);
          }
        }

        if (successCount > 0) {
          if (errors.length > 0) {
            toast.warning(`Saved ${successCount}/${c7Built.payloads.length} months. Failed: ${errors.join(', ')}`);
          } else {
            toast.success(`Saved ${successCount} month(s) for ${employees.length} employee(s) (${totalCo2e.toFixed(4)} tCO₂e total)`);
          }
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          toast.error('Failed to save C7 emissions. Please try again.');
        }

        setIsSaving(false);
        return;
      }
      
      // ===========================================
      // YEARLY FREQUENCY HANDLING (New)
      // ===========================================
      if (frequencyType === 'yearly') {
        // Build reporting period string for yearly
        const yearlyReportingPeriod = reportingYearType === 'financial' 
          ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
          : `CY${reportingYear}`;
        
        // Validate yearly data has at least one value
        let hasYearlyData = false;
        if (isProcessEmissions && selectedTemplate) {
          hasYearlyData = selectedTemplate.input_fields?.some(f => 
            yearlyData[f.key] && parseFloat(yearlyData[f.key]) > 0
          );
        } else if (dynamicInputFields.length > 0) {
          const requiredFields = dynamicInputFields.filter(f => !f.isOverride && !f.presentationOnly);
          hasYearlyData = requiredFields.some(f => {
            const value = yearlyData[f.variable] || yearlyData[f.fieldKey];
            return value && parseFloat(value) > 0;
          });
        } else {
          hasYearlyData = yearlyData.quantity && parseFloat(yearlyData.quantity) > 0;
        }
        
        if (!hasYearlyData) {
          toast.error('Please enter annual data');
          setIsSaving(false);
          return;
        }
        
        try {
          // Build the yearly payload similar to monthly but with yearly-specific fields
          const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
          const effectiveScope = isScope3Like ? 'scope3' : scope;
          
          // Build inputs from yearlyData
          const inputs = {};
          const userOverrides = {};
          let primaryQuantity = 0;
          let primaryUnit = '';
          
          if (isProcessEmissions && selectedTemplate) {
            // Process emissions yearly
            const formulaValues = {};
            selectedTemplate.input_fields?.forEach(field => {
              const fieldKey = field.key || field.variable || field.fieldKey;
              formulaValues[fieldKey] = parseFloat(yearlyData[fieldKey]) || 0;
              inputs[fieldKey] = {
                value: parseFloat(yearlyData[fieldKey]) || 0,
                unit: getProcessTemplateFieldUnit(yearlyData, field),
              };
            });
            selectedTemplate.predefined_inputs?.forEach(field => {
              formulaValues[field.key] = parseFloat(templateInputValues[field.key]) || parseFloat(field.value) || 0;
            });
            const density = getProvidedDensity(yearlyData);
            if (density) formulaValues.density = density.value;
            
            const calculatedEmission = evaluateFormula(selectedTemplate.formula, formulaValues);
            const primaryInputField = selectedTemplate.input_fields?.[0];
            const primaryInputKey = primaryInputField?.key || primaryInputField?.variable || primaryInputField?.fieldKey;
            primaryQuantity = primaryInputKey ? (parseFloat(yearlyData[primaryInputKey]) || 0) : 0;
            primaryUnit = primaryInputField ? getProcessTemplateFieldUnit(yearlyData, primaryInputField) : 'unit';
            
            const payload = {
              facility_id: facilityId,
              reporting_period: yearlyReportingPeriod,
              frequency_type: 'yearly',
              scope: 'scope1',
              category: 'Process Emissions',
              sub_category: selectedSubIndustry,
              fuel_type: selectedTemplate.name,
              quantity: primaryQuantity,
              quantity_unit: primaryUnit,
              unit: primaryUnit,
              calculated_co2e: calculatedEmission,
              outputs: {
                co2: { value: calculatedEmission, unit: 'tCO2' },
                ch4: { value: 0, unit: 'tCH4' },
                n2o: { value: 0, unit: 'tN2O' },
                co2e: { value: calculatedEmission, unit: 'tCO2e' },
              },
              notes: notes,
              responsible_person: responsiblePerson,
              responsible_person_designation: responsiblePersonDesignation,
              responsible_person_contact: responsiblePersonContact,
              process_names: [selectedSubIndustry, selectedTemplate.name],
              ...(density && {
                dynamic_field_values: {
                  density: { ...density, is_override: true },
                },
              }),
            };
            
            await axios.post(apiBase, payload, { headers: getAuthHeader() });
            toast.success(`Created yearly emission record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          } else if (dynamicInputFields.length > 0) {
            // ============================================================
            // YEARLY DISPATCH (post-Phase F: module-driven, single record)
            // ============================================================
            // Mirrors the monthly dispatch but runs ONCE with `yearlyData`
            // as the row and `yearlyReportingPeriod` as the reporting period.
            // Module resolution follows the same scope/category/biogenic
            // logic; payload shape matches modular monthly + adds
            // `frequency_type: 'yearly'` for backend differentiation.
            const yearlyMod = resolveDispatchModule();

            if (!yearlyMod) {
              console.error('[EmissionEntryForm] No module dispatched for yearly', { scope, category, biogenicScopeSelection });
              toast.error('This category is not yet supported for yearly submission. Please reload the page or contact support.');
              setIsSaving(false);
              return;
            }

            // Module-owned validation (same context shape as monthly dispatch)
            const yModValidation = yearlyMod.validateCreateSubmission({
              formData: { asset_name: assetName },
              processNames,
              assetName,
              fuelId,
              useCustomFuel,
              customFuelName,
              isOverrideCV: false,
              isOverrideDensity: false,
              overrideEmissionFactorHeat: false,
              overrideJustification: '',
              scope,
              category,
              capabilities,
              buildDecisionInputs,
            });
            if (!yModValidation.valid) {
              toast.error(yModValidation.errorMessage);
              setIsSaving(false);
              return;
            }

            const yBaseCtx = {
              scope, category, capabilities, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
              recordSource,
              biogenicScopeSelection,
              scope3Method, scope3ActivityId, scope3ActivityType, scope3Subcategory,
              typeOfProduct,
              scope3CustomActivity, useCustomActivity,
              supplierName, supplierCode, employeeName, employeeId,
              assetName, fromLocation, toLocation,
              notes, responsiblePerson, responsiblePersonDesignation, responsiblePersonContact,
              validProcesses,
              dynamicInputFields,
              filteredScope3Activities, requiresSubcategory, centralizedUnits,
              defaultUnit,
              buildDecisionInputs,
              // Per-row override flags read from yearlyData (yearly has a single row).
              isOverrideCV: !!yearlyData.overrideCalorificValue,
              isOverrideDensity: !!yearlyData.overrideDensity,
              overrideEmissionFactorHeat: !!yearlyData.overrideEmissionFactorHeat,
              overrideJustification: yearlyData.calorificValueJustification || yearlyData.densityJustification || yearlyData.emissionFactorHeatJustification || '',
              calculatedCO2: 0, calculatedCH4: 0, calculatedN2O: 0, calculatedCO2e: 0,
              resolvedFormulaId: null,
              reportingPeriod: yearlyReportingPeriod,
            };

            const { inputs: yInputs, userOverrides: yOverrides, isCustomFuelReady: yIsCustomFuelReady } = yearlyMod.extractInputsForCalcEngine(yearlyData, yBaseCtx);
            const { decisionInputs: yDecisionInputs, context: yContext, isScope3Like: yIsScope3Like } = yearlyMod.buildDecisionContext(yearlyData, yBaseCtx);

            if (useCustomFuel && !yIsCustomFuelReady) {
              toast.error('Complete Custom Fuel inputs are required before saving.');
              setIsSaving(false);
              return;
            }

            let yCalcCO2 = 0, yCalcCH4 = 0, yCalcN2O = 0, yCalcCO2e = 0;
            let yResolvedFormulaId = null;
            let yAuditLogId = null;

            const yEffectiveScope = yIsScope3Like ? 'scope3' : scope;
            const yCategoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === yEffectiveScope);

            if (isProcessCategory && !yCategoryObj?.id) {
              toast.error('Process Emissions calculation configuration is unavailable. Please contact an administrator.');
              setIsSaving(false);
              return;
            }

            if (useCustomFuel && !yCategoryObj?.id) {
              toast.error('Custom Fuel calculation category is unavailable.');
              setIsSaving(false);
              return;
            }

            if (yCategoryObj?.id) {
              try {
                const calcResp = await axios.post(`${API}/calc-engine/execute-by-category`, {
                  category_id: yCategoryObj.id,
                  decision_inputs: yDecisionInputs,
                  inputs: yInputs,
                  context: yContext,
                  user_overrides: yOverrides,
                  dry_run: false,
                  ...(yIsScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
                }, { headers: getAuthHeader() });
                if (calcResp.data?.ok) {
                  const r = calcResp.data;
                  yCalcCO2 = r.outputs?.co2?.value || r.co2_emissions || 0;
                  yCalcCH4 = r.outputs?.ch4?.value || r.ch4_emissions || 0;
                  yCalcN2O = r.outputs?.n2o?.value || r.n2o_emissions || 0;
                  yCalcCO2e = r.outputs?.co2e?.value || r.co2e_emissions || 0;
                  yResolvedFormulaId = r.resolved_formula?.id || r.formula_id || null;
                  yAuditLogId = r.audit_log_id || null;
                } else {
                  toast.error('Calculation returned no result. Please review the entered units and values.');
                  setIsSaving(false);
                  return;
                }
              } catch (e) {
                toast.error(e.response?.data?.detail || 'Calculation failed. Please review the entered units and values.');
                setIsSaving(false);
                return;
              }
            }

            const yPayload = {
              ...yearlyMod.buildCreatePayload(yearlyData, {
                ...yBaseCtx,
                calculatedCO2: yCalcCO2, calculatedCH4: yCalcCH4, calculatedN2O: yCalcN2O, calculatedCO2e: yCalcCO2e,
                resolvedFormulaId: yResolvedFormulaId,
              }),
              // Yearly-only marker (legacy parity)
              frequency_type: 'yearly',
            };

            const yResp = await axios.post(apiBase, yPayload, { headers: getAuthHeader() });
            if (yResp.data?.id) linkAuditLog(yAuditLogId, yResp.data.id);
            toast.success(`Created yearly emission record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          }
        } catch (error) {
          console.error('Error saving yearly emission:', error);
          const detail = error.response?.data?.detail;
          const errorMsg = Array.isArray(detail) 
            ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ')
            : (typeof detail === 'string' ? detail : 'Failed to save yearly emission');
          toast.error(errorMsg);
        } finally {
          setIsSaving(false);
        }
        return;
      }
      
      // ===========================================
      // MONTHLY FREQUENCY HANDLING (Existing)
      // ===========================================
      // For process emissions, filter months that have template input data
      // For regular emissions, filter months with dynamic field data
      let monthsWithData;
      if (isProcessEmissions && selectedTemplate) {
        const inputFields = selectedTemplate.input_fields || [];
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => {
          return inputFields.some(field => data?.[field.key] && parseFloat(data[field.key]) > 0);
        });
      } else if (dynamicInputFields.length > 0) {
        // For dynamic form config, check if any required field (non-override) has value
        const requiredFields = dynamicInputFields.filter(f => !f.isOverride && !f.presentationOnly);
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => {
          return requiredFields.some(field => {
            const value = data?.[field.variable] || data?.[field.fieldKey];
            return value && parseFloat(value) > 0;
          });
        });
      } else {
        // No dynamic fields - should not happen if form is loaded correctly
        monthsWithData = [];
      }

      if (monthsWithData.length === 0) {
        toast.error('Please enter data for at least one month');
        setIsSaving(false);
        return;
      }

      // PROCESS EMISSIONS HANDLING
      if (isProcessEmissions && selectedTemplate) {
        let successCount = 0;
        const errors = [];
        
        for (const [monthKey, data] of monthsWithData) {
          const actualYear = getActualYearForMonth(monthKey);
          const reportingPeriod = `${actualYear}-${monthKey}`;
          
          // Build formula values from monthly data (required inputs) and overridden predefined inputs
          const formulaValues = {};
          
          // Add required input values from monthly data
          selectedTemplate.input_fields?.forEach(field => {
            formulaValues[field.key] = parseFloat(data[field.key]) || 0;
          });
          
          // Add predefined values (use overridden values from templateInputValues)
          selectedTemplate.predefined_inputs?.forEach(field => {
            formulaValues[field.key] = parseFloat(templateInputValues[field.key]) || parseFloat(field.value) || 0;
          });
          const density = getProvidedDensity(data);
          if (density) formulaValues.density = density.value;
          
          // Calculate emissions using template formula
          const calculatedEmission = evaluateFormula(selectedTemplate.formula, formulaValues);
          
          // Get the primary input field info for display
          const primaryInputField = selectedTemplate.input_fields?.[0];
          const primaryInputKey = primaryInputField?.key || primaryInputField?.variable || primaryInputField?.fieldKey;
          const activityQuantity = primaryInputKey ? (parseFloat(data[primaryInputKey]) || 0) : 0;
          const activityUnit = primaryInputField ? getProcessTemplateFieldUnit(data, primaryInputField) : 'unit';
          
          const payload = {
            facility_id: facilityId,
            reporting_period: reportingPeriod,
            scope: 'scope1', // Process emissions are Scope 1
            category: 'Process Emissions',
            sub_category: selectedSubIndustry,
            fuel_type: selectedTemplate.name,
            quantity: activityQuantity,
            quantity_unit: activityUnit,
            unit: activityUnit,
            emission_factor: 1,
            emission_factor_ch4: null,
            emission_factor_n2o: null,
            is_custom_factor: false,
            source_of_information: `Template: ${selectedTemplate.name}`,
            record_source: recordSource ? String(recordSource).trim() : '',
            notes: notes,
            responsible_person: responsiblePerson,
            responsible_person_designation: responsiblePersonDesignation,
            responsible_person_contact: responsiblePersonContact,
            process_names: [selectedSubIndustry, selectedTemplate.name],
            evidence_url: data.evidences?.map(e => e.url).join(',') || '',
            // Pre-calculated values
            calculated_co2: calculatedEmission,
            calculated_ch4: 0,
            calculated_n2o: 0,
            calculated_co2e: calculatedEmission,
            outputs: {
              co2: { value: calculatedEmission, unit: 'tCO2' },
              ch4: { value: 0, unit: 'tCH4' },
              n2o: { value: 0, unit: 'tN2O' },
              co2e: { value: calculatedEmission, unit: 'tCO2e' },
            },
            co2_unit: 'tCO2',
            ch4_unit: 'tCH4',
            n2o_unit: 'tN2O',
            co2e_unit: 'tCO2e',
            // Template metadata
            template_id: selectedTemplate.id,
            template_inputs: formulaValues,
            ...(density && {
              dynamic_field_values: {
                density: { ...density, is_override: true },
              },
            }),
          };
          
          try {
            await axios.post(apiBase, payload, {
              headers: getAuthHeader()
            });
            successCount++;
          } catch (err) {
            console.error(`Failed to save process emission for ${reportingPeriod}:`, err);
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${err.response?.data?.detail || 'Failed'}`);
          }
        }
        
        if (successCount > 0) {
          toast.success(`Created ${successCount} process emission record(s) successfully`);
        }
        if (errors.length > 0) {
          toast.error(`Failed to save: ${errors.join(', ')}`);
        }
        if (successCount > 0) {
          onSuccess?.();
        }
        setIsSaving(false);
        return;
      }

      // ===========================================
      // CREATE MIGRATION PHASES C/D/E/F — Module dispatch
      // ===========================================
      // Routes through module helpers when:
      //   - frequencyType === 'monthly'
      //   - scope is scope1/scope2/scope3 OR biogenic (Phase F)
      //   - active module exposes buildCreatePayload
      //   - category is NOT C7 (multi-employee — has its own dedicated branch)
      const dispatchActiveModule = frequencyType === 'monthly' ? resolveDispatchModule() : null;

      // ===========================================
      // CUSTOM FUEL DIRECT SAVE (no module needed)
      // ===========================================
      // Scope 1 / Biogenic Scope 1 custom fuel: compute emissions client-side
      // and save directly, since no category module is registered.
      if (!dispatchActiveModule && useCustomFuel && frequencyType === 'monthly') {
        const monthsWithData = Object.entries(monthlyData).filter(([, d]) => {
          const qty = parseFloat(d.quantity || d.qty || 0);
          return qty > 0;
        });
        if (monthsWithData.length === 0) {
          toast.error('Please enter quantity for at least one month.');
          setIsSaving(false);
          return;
        }
        const validProcesses = (processNames || []).filter(p => p.name?.trim());
        let successCount = 0;
        const errors = [];
        for (const [monthKey, data] of monthsWithData) {
          const actualYear = getActualYearForMonth(monthKey);
          const reportingPeriod = `${actualYear}-${monthKey}`;
          const customFuelCalculation = buildCustomFuelCalculationPayload({
            dynamicFieldValues: data,
            calculationMethodology: decisionFieldValues?.calculation_methodology,
          });
          if (!customFuelCalculation.isReady) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: complete Custom Fuel inputs are required`);
            continue;
          }
          const effectiveScope = scope === 'biogenic' && biogenicScopeSelection === 'scope1' ? 'scope1' : scope;
          const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
          if (!categoryObj?.id) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Custom Fuel calculation category is unavailable`);
            continue;
          }
          let calculation;
          try {
            const response = await axios.post(`${API}/calc-engine/execute-by-category`, {
              category_id: categoryObj.id,
              decision_inputs: { calculation_methodology: decisionFieldValues?.calculation_methodology || 'using_heat_basis_ncv' },
              inputs: customFuelCalculation.inputs,
              user_overrides: customFuelCalculation.userOverrides,
              context: {
                fuel_name: customFuelName,
                fuel_id: null,
                scope: effectiveScope,
                category,
                facility_id: facilityId,
                reporting_period: reportingPeriod,
                is_custom_fuel: true,
              },
              dry_run: false,
            }, { headers: getAuthHeader() });
            if (!response.data?.ok) throw new Error('Calculation engine returned no result');
            calculation = response.data;
          } catch (error) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: backend calculation failed`);
            continue;
          }
          const cfAuditLogId = calculation.audit_log_id || null;
          const outputs = calculation.outputs || {};
          const qtyUnit = data.custom_qty_unit || data.unit || 'kg';
          const payload = {
            facility_id: facilityId,
            scope,
            category,
            fuel_name: customFuelName,
            fuel_id: null,
            is_custom_fuel: true,
            is_custom_factor: true,
            reporting_period: reportingPeriod,
            quantity: parseFloat(data.quantity || data.qty || 0),
            unit: qtyUnit,
            formula_id: calculation.resolved_formula?.id || calculation.formula_id || null,
            calculated_co2: outputs.co2?.value || calculation.co2_emissions || 0,
            calculated_ch4: outputs.ch4?.value || calculation.ch4_emissions || 0,
            calculated_n2o: outputs.n2o?.value || calculation.n2o_emissions || 0,
            calculated_co2e: outputs.co2e?.value || calculation.co2e_emissions || 0,
            co2e_total: outputs.co2e?.value || calculation.co2e_emissions || 0,
            notes,
            record_source: recordSource || 'manual',
            responsible_person: responsiblePerson,
            responsible_person_designation: responsiblePersonDesignation,
            responsible_person_contact: responsiblePersonContact,
            process_names: validProcesses.map(p => p.name),
            process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
            biogenic_scope_selection: biogenicScopeSelection || null,
            calculation_methodology: decisionFieldValues?.calculation_methodology || 'using_heat_basis_ncv',
            custom_source: customSource || '',
            dynamic_field_values: {
              qty: { value: parseFloat(data.quantity || data.qty || 0), unit: qtyUnit },
              ...(data.custom_ef ? { custom_ef: { value: parseFloat(data.custom_ef), unit: data.custom_ef_unit || '' } } : {}),
              ...(data.custom_cv ? { custom_cv: { value: parseFloat(data.custom_cv), unit: data.custom_cv_unit || '' } } : {}),
              ...(data.custom_carbon_content ? { custom_carbon_content: { value: parseFloat(data.custom_carbon_content), unit: '%' } } : {}),
              ...(data.custom_oxidation_factor ? { custom_oxidation_factor: { value: parseFloat(data.custom_oxidation_factor), unit: '' } } : {}),
              ...(getProvidedDensity(data) ? { density: getProvidedDensity(data) } : {}),
              calculation_methodology: { value: decisionFieldValues?.calculation_methodology || 'using_heat_basis_ncv', unit: '' },
            },
          };
          try {
            const cfResp = await axios.post(apiBase, payload, { headers: getAuthHeader() });
            successCount++;
            if (cfResp.data?.id) linkAuditLog(cfAuditLogId, cfResp.data.id);
          } catch (err) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${err.response?.data?.detail || 'Failed'}`);
          }
        }
        if (successCount > 0) toast.success(`Created ${successCount} custom fuel emission record(s)`);
        if (errors.length > 0) toast.error(`Failed: ${errors.join(', ')}`);
        if (successCount > 0) onSuccess?.();
        setIsSaving(false);
        return;
      }

      if (dispatchActiveModule) {
        // 1. Module-owned validation
        // Note: per-month override flags (CV/density/EFH) live in monthlyData[m]
        // and are validated inside the per-month loop below. Pass false at
        // submission gate; per-row gates re-check via data.* in the loop.
        const modValidation = dispatchActiveModule.validateCreateSubmission({
          formData: { asset_name: assetName },
          processNames,
          assetName,
          fuelId,
          useCustomFuel,
          customFuelName,
          isOverrideCV: false,
          isOverrideDensity: false,
          overrideEmissionFactorHeat: false,
          overrideJustification: '',
          scope,
          category,
          capabilities,
          buildDecisionInputs,
        });
        if (!modValidation.valid) {
          toast.error(modValidation.errorMessage);
          setIsSaving(false);
          return;
        }

        let successCount = 0;
        const errors = [];
        const savedEmissionIds = []; // Track saved emission IDs for OCR finalize
        for (const [monthKey, data] of monthsWithData) {
          const actualYear = getActualYearForMonth(monthKey);
          const reportingPeriod = `${actualYear}-${monthKey}`;

          const baseCtx = {
            scope, category, capabilities, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
            recordSource,
            biogenicScopeSelection,
            scope3Method, scope3ActivityId, scope3ActivityType, scope3Subcategory,
            typeOfProduct,
            scope3CustomActivity, useCustomActivity,
            supplierName, supplierCode, employeeName, employeeId,
            assetName, fromLocation, toLocation,
            notes, responsiblePerson, responsiblePersonDesignation, responsiblePersonContact,
            validProcesses,
            dynamicInputFields,
            filteredScope3Activities, requiresSubcategory, centralizedUnits,
            defaultUnit,
            buildDecisionInputs,
            // Per-month CV/density override flags read from `data` (the row).
            // Pass row-level flags so Scope1Create payload sets override_justification correctly.
            isOverrideCV: !!data.overrideCalorificValue,
            isOverrideDensity: !!data.overrideDensity,
            overrideEmissionFactorHeat: !!data.overrideEmissionFactorHeat,
            overrideJustification: data.calorificValueJustification || data.densityJustification || data.emissionFactorHeatJustification || '',
            calculatedCO2: 0, calculatedCH4: 0, calculatedN2O: 0, calculatedCO2e: 0,
            resolvedFormulaId: null,
            reportingPeriod,
          };

          const { inputs, userOverrides, isCustomFuelReady } = dispatchActiveModule.extractInputsForCalcEngine(data, baseCtx);
          const { decisionInputs, context, isScope3Like } = dispatchActiveModule.buildDecisionContext(data, baseCtx);

          if (useCustomFuel && !isCustomFuelReady) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: complete Custom Fuel inputs are required`);
            continue;
          }

          let calculatedCO2 = 0, calculatedCH4 = 0, calculatedN2O = 0, calculatedCO2e = 0;
          let resolvedFormulaId = null;
          let auditLogId = null;

          // Calc-engine lookup uses scope-specific category code
          const effectiveScopeForLookup = isScope3Like ? 'scope3' : scope;
          const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScopeForLookup);

          if (isProcessCategory && !categoryObj?.id) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Process Emissions calculation configuration is unavailable`);
            continue;
          }

          if (useCustomFuel && !categoryObj?.id) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Custom Fuel calculation category is unavailable`);
            continue;
          }

          if (categoryObj?.id) {
            try {
              // For custom fuel, merge ef_quantity into user_overrides for the backend
              const effectiveOverrides = { ...userOverrides };
              if (useCustomFuel && inputs.ef_quantity) {
                effectiveOverrides.ef_quantity = inputs.ef_quantity;
                effectiveOverrides.emission_factor = inputs.ef_quantity;
              }
              const calcResp = await axios.post(`${API}/calc-engine/execute-by-category`, {
                category_id: categoryObj.id,
                decision_inputs: decisionInputs,
                inputs,
                context,
                user_overrides: effectiveOverrides,
                dry_run: false,
                ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
              }, { headers: getAuthHeader() });
              if (calcResp.data?.ok) {
                const r = calcResp.data;
                calculatedCO2 = r.outputs?.co2?.value || r.co2_emissions || 0;
                calculatedCH4 = r.outputs?.ch4?.value || r.ch4_emissions || 0;
                calculatedN2O = r.outputs?.n2o?.value || r.n2o_emissions || 0;
                calculatedCO2e = r.outputs?.co2e?.value || r.co2e_emissions || 0;
                resolvedFormulaId = r.resolved_formula?.id || r.formula_id || null;
                auditLogId = r.audit_log_id || null;
              } else {
                errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: calculation returned no result`);
                continue;
              }
            } catch (e) {
              const detail = e.response?.data?.detail;
              errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${typeof detail === 'string' ? detail : 'calculation failed'}`);
              continue;
            }
          }

          const payload = dispatchActiveModule.buildCreatePayload(data, {
            ...baseCtx,
            calculatedCO2, calculatedCH4, calculatedN2O, calculatedCO2e,
            resolvedFormulaId,
          });

          try {
            const response = await axios.post(apiBase, payload, { headers: getAuthHeader() });
            successCount++;
            // Collect emission record ID for OCR finalize
            if (response.data?.id) {
              savedEmissionIds.push(response.data.id);
              linkAuditLog(auditLogId, response.data.id);
            }
          } catch (err) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Save failed`);
          }
        }

        // Finalize OCR import if we have saved emission IDs
        if (savedEmissionIds.length > 0 && ocrPrefillData?.line_item_id) {
          await finalizeOcrImport(savedEmissionIds);
        }

        if (successCount > 0) toast.success(`Created ${successCount} emission record(s) successfully`);
        if (errors.length > 0) toast.error(`Failed to save some records. Please try again.`);
        if (successCount > 0) onSuccess?.();
        setIsSaving(false);
        return;
      }

      // ===========================================
      // DEFENSIVE FALLBACK (post-Phase F)
      // ===========================================
      // The dispatch block above covers every reachable monthly path:
      //   - Scope 1 (Stationary/Mobile/Fugitive + Generic), Scope 2 (Generic),
      //     Scope 3 flat (C1–C6, C8–C15), biogenic+scope1, biogenic+scope3.
      //   - C7 multi-employee returns early in its own dedicated branch above.
      // If we reach here, no module matched — surface a clear error so the
      // bug is observable instead of silently producing no record.
      console.error('[EmissionEntryForm] No module dispatched for', { scope, category, frequencyType, biogenicScopeSelection });
      toast.error('This category is not yet supported for direct submission. Please reload the page or contact support.');
    } catch (error) {
      // Temporary diagnostic: surface the underlying exception in DevTools so
      // we can identify the precise root cause instead of a generic toast.
      // Remove once the failing path is identified and patched.
      console.error('[useEmissionSubmit] save failed:', error, {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        stack: error?.stack,
      });
      toast.error('Failed to save emissions. Please try again.');
    } finally {
      setIsSaving(false); // Re-enable button after completion
    }
  };

  return { submit };
}

export default useEmissionSubmit;
