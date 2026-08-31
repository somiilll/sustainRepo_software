/**
 * persistCalcAuditLog — E3 modularization phase.
 *
 * Persists the calc engine audit log after a successful PUT/POST so override
 * sources reload correctly on re-edit. Called by every dispatch branch
 * (C7 module / per-category module / legacy) for behaviour parity.
 *
 * Best-effort — failures are logged via console.warn and never block the
 * user-facing save flow.
 *
 * Lifted byte-identically from src/pages/Emissions.js handleSubmit (where
 * it lived as an inline closure) so the legacy edit page and any future
 * caller stay on a single audit-log code path.
 */
import axios from 'axios';
import { buildCustomFuelCalculationPayload } from './customFuelCalcAdapter';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export async function persistCalcAuditLog(emissionId, ctx) {
  const {
    formData,
    biogenicScopeSelection,
    dynamicCategories,
    selectedCategory,
    dynamicInputFields,
    dynamicFieldValues,
    buildEditDecisionInputs,
    filteredScope3Activities,
    scope3ActivityId,
    scope3Method,
    scope3Subcategory,
    useCustomActivity,
    scope3CustomActivity,
    requiresSubcategory,
    selectedFuel,
    editUseCustomFuel,
    editCustomFuelName,
    editCalcMethodology,
    getAuthHeader,
  } = ctx;

  if (!emissionId || dynamicInputFields.length === 0) return;

  try {
    // Effective scope for category lookup: biogenic-scope3 records use
    // the underlying Scope 3 category definitions (biogenic categories
    // are not duplicated under scope_code='biogenic' for Scope 3).
    const effectiveScope = (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')
      ? 'scope3'
      : formData.scope;
    const categoryObj = dynamicCategories.find(
      c => c.name === (formData.category || selectedCategory) && c.scope_code === effectiveScope
    );
    if (!categoryObj?.id) return;

    // Build inputs from non-override dynamic fields
    const inputs = {};
    dynamicInputFields.filter(f => !f.isOverride).forEach(field => {
      const value = dynamicFieldValues[field.variable];
      if (value !== undefined && value !== '' && value !== null) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          const unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
          inputs[field.variable] = { value: numValue, unit };
        }
      }
    });

    // Build user overrides from override fields
    const userOverrides = {};
    dynamicInputFields.filter(f => f.isOverride).forEach(field => {
      const overrideKey = `override_${field.variable}`;
      if (dynamicFieldValues[overrideKey]) {
        const value = dynamicFieldValues[field.variable];
        if (value !== undefined && value !== null && value !== '') {
          const unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
          userOverrides[field.variable] = { value: parseFloat(value), unit };
        }
      }
    });

    const customFuelCalculation = editUseCustomFuel
      ? buildCustomFuelCalculationPayload({
        dynamicFieldValues,
        formData,
        categoryName: formData.category || selectedCategory,
        calculationMethodology: editCalcMethodology,
      })
      : null;
    if (customFuelCalculation) {
      Object.assign(inputs, customFuelCalculation.inputs);
      Object.assign(userOverrides, customFuelCalculation.userOverrides);
      if (!customFuelCalculation.isReady) return;
    }

    const decisionInputs = buildEditDecisionInputs();

    const matchedEFForSave = filteredScope3Activities.find(a => a.id === scope3ActivityId);
    const scope3Context = formData.scope === 'scope3' ? {
      calculation_method_scope3: scope3Method,
      scope3_ef_id: scope3ActivityId,
      activity: (scope3Method === 'supplier_basis' && useCustomActivity)
        ? scope3CustomActivity
        : matchedEFForSave?.activity,
      scope3_ef_default_unit: matchedEFForSave?.default_unit || '',
    } : {};

    let fuelNameForContext = editUseCustomFuel ? editCustomFuelName : selectedFuel?.fuel_name;
    if (formData.scope === 'scope3' && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForSave?.activity) {
      fuelNameForContext = matchedEFForSave.activity;
    }

    const calcPayload = {
      category_id: categoryObj.id,
      decision_inputs: decisionInputs,
      inputs,
      context: {
        fuel_name: fuelNameForContext,
        fuel_id: editUseCustomFuel ? null : selectedFuel?.id,
        scope: formData.scope,
        category: formData.category || selectedCategory,
        reporting_period: formData.reporting_period_start,
        is_custom_fuel: editUseCustomFuel || false,
        ...scope3Context,
      },
      user_overrides: userOverrides,
      dry_run: false,
      emission_record_id: emissionId,
      ...(formData.scope === 'scope3' && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
    };

    await axios.post(`${API}/calc-engine/execute-by-category`, calcPayload, {
      headers: getAuthHeader(),
    });
  } catch (auditError) {
     
    console.warn('Failed to persist audit log:', auditError);
    // Don't fail the save flow on audit log error
  }
}

export default persistCalcAuditLog;
