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
import { buildLegacyProcessTemplatePayload } from '../utils/processTemplateSavePayload';
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
      facilityId, scope, category, categoryCode, fuelId,
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

    // Density is a virtual, conditional field for Process Emissions and for
    // Stationary/Mobile Carbon Composition. Resolve its requirement from the
    // exact values about to be persisted so a stale UI effect cannot allow the
    // calculation engine to use a default factor.
    const isProcessCategory = isProcessEmissions || categoryCode === 'process_emissions';
    const isCombustionCategory = ['stationary_combustion', 'mobile_combustion'].includes(categoryCode);
    if (isProcessCategory || isCombustionCategory) {
      const rowsToValidate = frequencyType === 'yearly'
        ? [['yearly', yearlyData]]
        : Object.entries(monthlyData || {});
      for (const [periodKey, data] of rowsToValidate) {
        const calculationMethodology = decisionFieldValues?.calculation_methodology
          || data?.calculation_methodology
          || buildDecisionInputs?.(data)?.calculation_methodology;
        if (!isProcessCategory && calculationMethodology !== 'using_carbon_composition') continue;
        const requirement = resolveProcessDensityRequirement({
          data,
          dynamicInputFields,
          calculationMethodology,
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

    // Config-driven Scope 1/2 submissions use this same calculation contract
    // for a monthly row and the annual row. In particular, Custom Fuel EF
    // overrides and Process Emissions decision inputs must not diverge by
    // frequency before reaching the calculation engine.
    const calculateModuleRow = async ({ activeModule, data, baseCtx }) => {
      const {
        inputs,
        userOverrides,
        isCustomFuelReady,
        customFuelMissingFields = [],
      } = activeModule.extractInputsForCalcEngine(data, baseCtx);
      if (useCustomFuel && !isCustomFuelReady) {
        return { error: `Missing: ${customFuelMissingFields.join(', ') || 'Custom Fuel inputs'}` };
      }

      const { decisionInputs, context, isScope3Like } = activeModule.buildDecisionContext(data, baseCtx);
      const effectiveScopeForLookup = isScope3Like ? 'scope3' : scope;
      const categoryObj = dynamicCategories.find((item) => (
        item.scope_code === effectiveScopeForLookup
        && (item.code === categoryCode || (!categoryCode && item.name === category))
      ));

      if (isProcessCategory && !categoryObj?.id) {
        return { error: 'Process Emissions calculation configuration is unavailable' };
      }
      if (useCustomFuel && !categoryObj?.id) {
        return { error: 'Custom Fuel calculation category is unavailable' };
      }

      const result = {
        inputs,
        userOverrides,
        calculatedCO2: 0,
        calculatedCH4: 0,
        calculatedN2O: 0,
        calculatedCO2e: 0,
        resolvedFormulaId: null,
        auditLogId: null,
      };
      if (!categoryObj?.id) return result;

      const effectiveOverrides = { ...userOverrides };
      if (useCustomFuel && inputs.ef_quantity) {
        effectiveOverrides.ef_quantity = inputs.ef_quantity;
        effectiveOverrides.emission_factor = inputs.ef_quantity;
      }

      try {
        const calcResp = await axios.post(`${API}/calc-engine/execute-by-category`, {
          category_id: categoryObj.id,
          decision_inputs: decisionInputs,
          inputs,
          context,
          user_overrides: effectiveOverrides,
          dry_run: false,
          ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
        }, { headers: getAuthHeader() });
        if (!calcResp.data?.ok) return { error: 'calculation returned no result' };

        const calculated = calcResp.data;
        return {
          ...result,
          calculatedCO2: calculated.outputs?.co2?.value || calculated.co2_emissions || 0,
          calculatedCH4: calculated.outputs?.ch4?.value || calculated.ch4_emissions || 0,
          calculatedN2O: calculated.outputs?.n2o?.value || calculated.n2o_emissions || 0,
          calculatedCO2e: calculated.outputs?.co2e?.value || calculated.co2e_emissions || 0,
          resolvedFormulaId: calculated.resolved_formula?.id || calculated.formula_id || null,
          auditLogId: calculated.audit_log_id || null,
        };
      } catch (error) {
        const detail = error.response?.data?.detail;
        return { error: typeof detail === 'string' ? detail : 'calculation failed' };
      }
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
          if (isProcessEmissions && selectedTemplate) {
            const payload = buildLegacyProcessTemplatePayload({
              data: yearlyData,
              reportingPeriod: yearlyReportingPeriod,
              frequencyType: 'yearly',
              facilityId,
              category,
              categoryCode,
              selectedSubIndustry,
              selectedTemplate,
              templateInputValues,
              evaluateFormula,
              recordSource,
              notes,
              responsiblePerson,
              responsiblePersonDesignation,
              responsiblePersonContact,
            });
            
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
              scope, category, categoryCode, capabilities, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
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
              frequencyType,
              // Per-row override flags read from yearlyData (yearly has a single row).
              isOverrideCV: !!yearlyData.overrideCalorificValue,
              isOverrideDensity: !!yearlyData.overrideDensity,
              overrideEmissionFactorHeat: !!yearlyData.overrideEmissionFactorHeat,
              overrideJustification: yearlyData.calorificValueJustification || yearlyData.densityJustification || yearlyData.emissionFactorHeatJustification || '',
              calculatedCO2: 0, calculatedCH4: 0, calculatedN2O: 0, calculatedCO2e: 0,
              resolvedFormulaId: null,
              reportingPeriod: yearlyReportingPeriod,
            };

            const yearlyCalculation = await calculateModuleRow({
              activeModule: yearlyMod,
              data: yearlyData,
              baseCtx: yBaseCtx,
            });
            if (yearlyCalculation.error) {
              toast.error(yearlyCalculation.error);
              setIsSaving(false);
              return;
            }

            const yPayload = {
              ...yearlyMod.buildCreatePayload(yearlyData, {
                ...yBaseCtx,
                ...yearlyCalculation,
              }),
              // Yearly-only marker (legacy parity)
              frequency_type: 'yearly',
            };

            const yResp = await axios.post(apiBase, yPayload, { headers: getAuthHeader() });
            if (yResp.data?.id) linkAuditLog(yearlyCalculation.auditLogId, yResp.data.id);
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
          
          const payload = buildLegacyProcessTemplatePayload({
            data,
            reportingPeriod,
            frequencyType: 'monthly',
            facilityId,
            category,
            categoryCode,
            selectedSubIndustry,
            selectedTemplate,
            templateInputValues,
            evaluateFormula,
            recordSource,
            notes,
            responsiblePerson,
            responsiblePersonDesignation,
            responsiblePersonContact,
          });
          
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
            scope, category, categoryCode, capabilities, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
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
            frequencyType,
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

          const rowCalculation = await calculateModuleRow({
            activeModule: dispatchActiveModule,
            data,
            baseCtx,
          });
          if (rowCalculation.error) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${rowCalculation.error}`);
            continue;
          }

          const payload = dispatchActiveModule.buildCreatePayload(data, {
            ...baseCtx,
            ...rowCalculation,
          });

          try {
            const response = await axios.post(apiBase, payload, { headers: getAuthHeader() });
            successCount++;
            // Collect emission record ID for OCR finalize
            if (response.data?.id) {
              savedEmissionIds.push(response.data.id);
              linkAuditLog(rowCalculation.auditLogId, response.data.id);
            }
          } catch (err) {
            const detail = err.response?.data?.detail;
            const saveError = Array.isArray(detail)
              ? detail.map((item) => item.msg || item.message || JSON.stringify(item)).join(', ')
              : (typeof detail === 'string' ? detail : 'Unable to save this record');
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${saveError}`);
          }
        }

        // Finalize OCR import if we have saved emission IDs
        if (savedEmissionIds.length > 0 && ocrPrefillData?.line_item_id) {
          await finalizeOcrImport(savedEmissionIds);
        }

        if (successCount > 0) toast.success(`Created ${successCount} emission record(s) successfully`);
        if (errors.length > 0) toast.error(errors.join(' • '), { duration: 10000 });
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
