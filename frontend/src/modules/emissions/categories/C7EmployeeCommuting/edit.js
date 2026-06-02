/**
 * C7 Employee Commuting — Edit-flow business logic
 *
 * Pure functions that own:
 *   - validation orchestration for the edit dialog submission
 *   - aggregate computations (total CO2e, formula id extraction)
 *   - the final PUT payload shape sent to `/api/emissions/{id}`
 *
 * UI rendering remains in `Emissions.js` (MultiEmployeeInput).
 * This module is invoked by the orchestration layer to keep
 * `Emissions.js` free of category-specific business logic.
 *
 * IMPORTANT: payload shape, validation messages, and behaviour
 * MUST stay byte-identical to the previous inline implementation.
 */

/**
 * Validate the C7 edit submission.
 *
 * @param {Object} ctx
 * @param {Array}  ctx.editEmployees
 * @param {Object} ctx.editingEmission
 * @param {Array}  ctx.processNames                    formData.process_names
 * @returns {{ valid: boolean, errorMessage?: string, validProcessNames?: Array }}
 */
export function validateEditSubmission({ editEmployees, editingEmission, processNames }) {
  if (!editEmployees || editEmployees.length === 0) {
    return { valid: false, errorMessage: 'Please add at least one employee' };
  }

  const isYearlyMode = editingEmission?.frequency_type === 'yearly';

  // Per-employee validation
  const employeeErrors = [];
  editEmployees.forEach((emp, index) => {
    if (!emp.name || emp.name.trim() === '') {
      employeeErrors.push(`Employee ${index + 1}: Employee Name is required.`);
    }

    if (isYearlyMode) {
      const hasYearlyData = Object.values(emp.yearly_data?.inputs || {}).some(
        (v) => v !== '' && v !== null && v !== undefined && v !== 0
      );
      const hasDirectInputs = emp.inputs && Object.values(emp.inputs).some(
        (v) => v !== '' && v !== null && v !== undefined && v !== 0
      );

      if (!hasYearlyData && !hasDirectInputs) {
        employeeErrors.push(
          `${emp.name || `Employee ${index + 1}`}: Please enter annual data or remove the employee.`
        );
      }
    } else {
      const hasAnyMonthData = Object.values(emp.monthly_data || {}).some((monthData) => {
        if (!monthData?.inputs) return false;
        return Object.values(monthData.inputs).some(
          (v) => v !== '' && v !== null && v !== undefined && v !== 0
        );
      });

      if (!hasAnyMonthData) {
        employeeErrors.push(
          `${emp.name || `Employee ${index + 1}`}: Please enter data for at least one month or remove the employee.`
        );
      }
    }
  });

  if (employeeErrors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('Employee validation errors:', employeeErrors);
    return { valid: false, errorMessage: employeeErrors[0] };
  }

  // At least one employee must have either calculated emissions OR input
  // data present. The "inputs" fallback covers hydrated records whose
  // saved emissions normalised to 0 — the user has clearly entered data
  // and should be able to re-save without being forced to re-calculate.
  const hasCalculatedData = editEmployees.some((emp) => {
    if (isYearlyMode) {
      const hasYearlyEmissions =
        emp.yearly_data?.emissions?.co2e !== null &&
        emp.yearly_data?.emissions?.co2e !== undefined;
      const hasDirectEmissions =
        emp.emissions?.co2e !== null && emp.emissions?.co2e !== undefined;
      const yearlyInputs = emp.yearly_data?.inputs || emp.inputs || {};
      const hasInputs = Object.values(yearlyInputs).some(
        (v) => v !== '' && v !== null && v !== undefined && v !== 0
      );
      return hasYearlyEmissions || hasDirectEmissions || hasInputs;
    }
    return Object.values(emp.monthly_data || {}).some((m) => {
      const hasEmissions =
        m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined;
      const hasInputs =
        m?.inputs &&
        Object.values(m.inputs).some(
          (v) => v !== '' && v !== null && v !== undefined && v !== 0
        );
      return hasEmissions || hasInputs;
    });
  });

  if (!hasCalculatedData) {
    return {
      valid: false,
      errorMessage: 'Please calculate emissions for at least one employee',
    };
  }

  // Process names
  const validProcessNames = (processNames || []).filter(
    (p) => p.name && p.name.trim() !== ''
  );
  if (validProcessNames.length === 0) {
    return { valid: false, errorMessage: 'At least one Name of Process is required' };
  }

  return { valid: true, validProcessNames };
}

/**
 * Compute aggregate totals across all C7 employees.
 *
 * @param {Array}   editEmployees
 * @param {boolean} isYearlyMode
 * @param {Object}  editingEmission     used for default formula_id fallback
 * @returns {{ totalCo2e: number, extractedFormulaId: string|null }}
 */
export function extractTotals(editEmployees, isYearlyMode, editingEmission) {
  // total CO2e
  const totalCo2e = editEmployees.reduce((sum, emp) => {
    if (isYearlyMode) {
      return sum + (emp.yearly_data?.emissions?.co2e || emp.emissions?.co2e || 0);
    }
    return (
      sum +
      Object.values(emp.monthly_data || {}).reduce(
        (empSum, m) => empSum + (m?.emissions?.co2e || 0),
        0
      )
    );
  }, 0);

  // formula_id extraction
  let extractedFormulaId = editingEmission?.formula_id || null;
  if (isYearlyMode) {
    for (const emp of editEmployees) {
      const formulaId =
        emp.yearly_data?.calculation_details?.formula_id ||
        emp.calculation_details?.formula_id;
      if (formulaId) {
        extractedFormulaId = formulaId;
        break;
      }
    }
  } else {
    for (const emp of editEmployees) {
      for (const monthKey of Object.keys(emp.monthly_data || {})) {
        const monthData = emp.monthly_data[monthKey];
        if (monthData?.calculation_details?.formula_id) {
          extractedFormulaId = monthData.calculation_details.formula_id;
          break;
        }
      }
      if (extractedFormulaId && extractedFormulaId !== editingEmission?.formula_id) {
        break;
      }
    }
  }

  return { totalCo2e, extractedFormulaId };
}

/**
 * Build the exact PUT payload that the C7 edit dialog used to send.
 * Byte-identical with the prior inline implementation in Emissions.js.
 *
 * @param {Object} ctx
 * @param {Object} ctx.formData
 * @param {Object} ctx.editingEmission
 * @param {Array}  ctx.editEmployees
 * @param {string} ctx.scope3Method
 * @param {string} ctx.scope3ActivityId
 * @param {string} ctx.scope3ActivityType
 * @param {string} ctx.scope3CustomActivity
 * @param {boolean} ctx.useCustomActivity
 * @param {Array}  ctx.filteredScope3Activities
 * @param {Object} ctx.editEmployeeMonthlyTotals
 * @param {number} ctx.editEmployeeYearlyTotal
 * @param {Array}  ctx.validProcessNames
 * @returns {Object} payload
 */
export function buildEditPayload(ctx) {
  const {
    formData,
    editingEmission,
    editEmployees,
    scope3Method,
    scope3ActivityId,
    scope3ActivityType,
    scope3CustomActivity,
    useCustomActivity,
    filteredScope3Activities,
    editEmployeeMonthlyTotals,
    editEmployeeYearlyTotal,
    validProcessNames,
  } = ctx;

  const isYearlyMode = editingEmission?.frequency_type === 'yearly';
  const { totalCo2e, extractedFormulaId } = extractTotals(
    editEmployees,
    isYearlyMode,
    editingEmission
  );

  // Activity label
  const matchedActivityForSave = filteredScope3Activities.find(
    (a) => a.id === scope3ActivityId
  );
  const activityLabel = useCustomActivity
    ? scope3CustomActivity || 'Custom Activity'
    : matchedActivityForSave?.activity ||
      matchedActivityForSave?.fuel_name ||
      scope3ActivityType;

  // Reporting period
  const c7ReportingPeriod =
    formData.reporting_period_start && formData.reporting_period_end
      ? formData.reporting_period_start === formData.reporting_period_end
        ? formData.reporting_period_start
        : `${formData.reporting_period_start} to ${formData.reporting_period_end}`
      : editingEmission?.reporting_period ||
        `${new Date().getFullYear()}-01 to ${new Date().getFullYear()}-12`;

  return {
    facility_id: formData.facility_id,
    reporting_period: c7ReportingPeriod,
    frequency_type: editingEmission?.frequency_type || 'monthly',
    scope: 'scope3',
    category: formData.category,
    sub_category: useCustomActivity
      ? scope3CustomActivity || ''
      : formData.sub_category || '',
    calculation_method_scope3: scope3Method,
    activity_type: scope3ActivityType,
    scope3_activity_type: scope3ActivityType,
    scope3_activity: activityLabel,
    scope3_ef_id: useCustomActivity ? null : scope3ActivityId || null,
    use_custom_activity: useCustomActivity,
    formula_id: extractedFormulaId,

    employees: editEmployees.map((emp) => {
      const baseEmployee = {
        id: emp.id,
        name: emp.name,
        employee_id: emp.employee_id,
        department: emp.department,
        activity_type: scope3ActivityType || emp.activity_type,
        from_location: emp.from_location || null,
        to_location: emp.to_location || null,
      };

      if (isYearlyMode) {
        return {
          ...baseEmployee,
          inputs: emp.yearly_data?.inputs || emp.inputs || {},
          emissions: emp.yearly_data?.emissions || emp.emissions || {},
          calculation_details:
            emp.yearly_data?.calculation_details || emp.calculation_details,
        };
      }
      return {
        ...baseEmployee,
        monthly_data: emp.monthly_data,
      };
    }),
    monthly_totals: isYearlyMode ? null : editEmployeeMonthlyTotals,
    yearly_total: editEmployeeYearlyTotal,

    outputs: {
      co2e: { value: totalCo2e, unit: 'tCO2e' },
    },

    process_names: validProcessNames.map((p) => p.name),
    process_descriptions: validProcessNames.map((p) => ({
      name: p.name,
      description: p.description || '',
    })),
    notes: formData.notes || '',
    source_of_information: (formData.source_of_information && String(formData.source_of_information).trim())
      || `Multi-employee commuting data for ${editEmployees.length} employee(s)`,
    justification: null,
    responsible_person: formData.responsible_person,
    responsible_person_designation: formData.responsible_person_designation || '',
    responsible_person_contact: formData.responsible_person_contact || '',

    // Derived helpers exposed to the orchestration layer for the success toast
    __totalCo2e: totalCo2e,
  };
}

/**
 * Bundle the edit-flow API.
 * Consumers should call `submitEdit({ axios, api, getAuthHeader, ...ctx })`.
 */
export const editApi = {
  validateEditSubmission,
  extractTotals,
  buildEditPayload,
};

export default editApi;
