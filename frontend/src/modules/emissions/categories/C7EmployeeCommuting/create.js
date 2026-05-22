/**
 * C7 Employee Commuting — CREATE-flow business logic
 *
 * Mirrors the EDIT counterpart `categories/C7EmployeeCommuting/edit.js`
 * for the CREATE wizard. Owns:
 *   - validation orchestration for yearly + monthly C7 submissions
 *   - per-month + yearly payload construction
 *   - endpoint selection — C7 uses dedicated endpoints
 *     (`/api/emissions/c7/yearly` and `/api/emissions/c7/month`),
 *     NOT the generic `/api/emissions` endpoint
 *
 * IMPORTANT: payload shape, validation messages, and behaviour
 * MUST stay byte-identical to the legacy inline implementation
 * in `EmissionEntryForm.js handleSubmit`.
 */

// ---------- helpers ----------

const hasYearlyData = (emp) =>
  Object.values(emp.yearly_data?.inputs || {}).some(
    (v) => v !== '' && v !== null && v !== undefined && v !== 0
  );

const hasAnyMonthData = (emp) =>
  Object.values(emp.monthly_data || {}).some((monthData) => {
    if (!monthData?.inputs) return false;
    return Object.values(monthData.inputs).some(
      (v) => v !== '' && v !== null && v !== undefined && v !== 0
    );
  });

// ---------- validation ----------

/**
 * Validate the C7 CREATE submission for yearly mode.
 *
 * @param {Object} ctx
 * @param {Array}  ctx.employees
 * @returns {{ valid: boolean, errorMessage?: string }}
 */
export function validateYearlyCreateSubmission({ employees }) {
  if (!employees || employees.length === 0) {
    return { valid: false, errorMessage: 'Please add at least one employee' };
  }

  const employeesWithoutData = employees.filter((emp) => !hasYearlyData(emp));
  if (employeesWithoutData.length > 0) {
    return {
      valid: false,
      errorMessage: `Please enter annual data for: ${employeesWithoutData
        .map((e) => e.name || 'Unnamed')
        .join(', ')}`,
    };
  }

  const calculated = employees.some(
    (emp) =>
      emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
  );
  if (!calculated) {
    return { valid: false, errorMessage: 'Please calculate emissions for at least one employee' };
  }

  return { valid: true };
}

/**
 * Validate the C7 CREATE submission for monthly mode.
 *
 * @param {Object} ctx
 * @param {Array}  ctx.employees
 * @returns {{ valid: boolean, errorMessage?: string }}
 */
export function validateMonthlyCreateSubmission({ employees }) {
  if (!employees || employees.length === 0) {
    return { valid: false, errorMessage: 'Please add at least one employee' };
  }

  const employeesWithoutData = employees.filter((emp) => !hasAnyMonthData(emp));
  if (employeesWithoutData.length > 0) {
    return {
      valid: false,
      errorMessage: `Please enter data for at least one month for: ${employeesWithoutData
        .map((e) => e.name || 'Unnamed')
        .join(', ')}`,
    };
  }

  const calculated = employees.some((emp) =>
    Object.values(emp.monthly_data || {}).some(
      (m) => m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined
    )
  );
  if (!calculated) {
    return { valid: false, errorMessage: 'Please calculate emissions for at least one employee/month' };
  }

  return { valid: true };
}

// ---------- yearly payload ----------

/**
 * Build the yearly C7 PUT/POST payload (single record).
 * Endpoint: POST /api/emissions/c7/yearly
 */
export function buildYearlyCreatePayload(ctx) {
  const {
    employees,
    facilityId,
    reportingYearType,
    reportingYear,
    scope3Method,
    scope3ActivityId,
    scope3ActivityType,
    scope3CustomActivity,
    filteredScope3Activities,
    notes,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    validProcesses,
  } = ctx;

  const yearlyReportingPeriod =
    reportingYearType === 'financial'
      ? `FY ${reportingYear}-${(parseInt(reportingYear, 10) + 1).toString().slice(-2)}`
      : `CY${reportingYear}`;

  const yearlyEmployees = employees
    .filter(
      (emp) =>
        emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
    )
    .map((emp) => ({
      id: emp.id,
      name: emp.name,
      employee_id: emp.employee_id,
      department: emp.department,
      from_location: emp.from_location || null,
      to_location: emp.to_location || null,
      activity_type: emp.activity_type || scope3ActivityType,
      inputs: emp.yearly_data?.inputs || {},
      emissions: emp.yearly_data?.emissions || {},
      calculation_details: emp.yearly_data?.calculation_details || null,
    }));

  return {
    endpoint: '/emissions/c7/yearly',
    reportingPeriod: yearlyReportingPeriod,
    payload: {
      facility_id: facilityId,
      reporting_year: yearlyReportingPeriod,
      calculation_method: scope3Method,
      activity_type: scope3ActivityType,
      activity_id: scope3ActivityId,
      activity_name:
        filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity ||
        scope3CustomActivity,
      formula_id: yearlyEmployees[0]?.calculation_details?.formula_id || null,
      formula_name: yearlyEmployees[0]?.calculation_details?.formula_name || null,
      employees: yearlyEmployees,
      notes,
      responsible_person: responsiblePerson,
      responsible_person_designation: responsiblePersonDesignation,
      responsible_person_contact: responsiblePersonContact,
      process_names: validProcesses.map((p) => p.name),
      process_descriptions: validProcesses.map((p) => ({
        name: p.name,
        description: p.description || '',
      })),
    },
  };
}

// ---------- monthly payload(s) ----------

/**
 * Build the per-month C7 payload list.
 * Endpoint per month: POST /api/emissions/c7/month
 *
 * @returns {{ endpoint: string, monthlyReportingYear: string, payloads: Array<{monthKey, payload, monthCo2e}> }}
 */
export function buildMonthlyCreatePayloads(ctx) {
  const {
    employees,
    facilityId,
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
    getActualYearForMonth,
  } = ctx;

  // Group employees by month
  const monthlyEmployeeGroups = {};
  employees.forEach((emp) => {
    const monthlyData = emp.monthly_data || {};
    Object.entries(monthlyData).forEach(([monthKey, monthData]) => {
      if (
        monthData?.emissions?.co2e !== null &&
        monthData?.emissions?.co2e !== undefined
      ) {
        if (!monthlyEmployeeGroups[monthKey]) monthlyEmployeeGroups[monthKey] = [];
        monthlyEmployeeGroups[monthKey].push({
          id: emp.id,
          name: emp.name,
          employee_id: emp.employee_id,
          department: emp.department,
          from_location: emp.from_location || null,
          to_location: emp.to_location || null,
          activity_type: emp.activity_type || scope3ActivityType,
          inputs: monthData.inputs || {},
          emissions: monthData.emissions || {},
          calculation_details: monthData.calculation_details || null,
        });
      }
    });
  });

  const monthsToSave = Object.keys(monthlyEmployeeGroups);
  if (monthsToSave.length === 0) {
    return { endpoint: '/emissions/c7/month', monthlyReportingYear: null, payloads: [] };
  }

  const monthlyReportingYear = getActualYearForMonth(monthsToSave[0]);

  const payloads = monthsToSave.map((monthKey) => {
    const monthEmployees = monthlyEmployeeGroups[monthKey];
    const monthCo2e = monthEmployees.reduce((sum, emp) => sum + (emp.emissions?.co2e || 0), 0);

    let activityId = null;
    let activityName = scope3ActivityType;
    if (useCustomActivity && scope3CustomActivity?.trim()) {
      activityId = null;
      activityName = scope3CustomActivity.trim();
    } else if (scope3ActivityId) {
      const selectedActivity = filteredScope3Activities.find((a) => a.id === scope3ActivityId);
      activityId = selectedActivity?.id || null;
      activityName = selectedActivity?.activity || scope3ActivityType;
    }

    let formulaId = null;
    let formulaName = '';
    for (const emp of monthEmployees) {
      if (emp.calculation_details?.formula_id) {
        formulaId = emp.calculation_details.formula_id;
        formulaName = emp.calculation_details.formula_name || '';
        break;
      }
    }

    return {
      monthKey,
      monthCo2e,
      payload: {
        facility_id: facilityId,
        reporting_year: monthlyReportingYear,
        reporting_month: monthKey,
        calculation_method: scope3Method,
        activity_type: scope3ActivityType,
        activity_id: activityId,
        activity_name: activityName,
        formula_id: formulaId,
        formula_name: formulaName,
        employees: monthEmployees,
        notes: notes || '',
        responsible_person: responsiblePerson,
        responsible_person_designation: responsiblePersonDesignation,
        responsible_person_contact: responsiblePersonContact,
        process_names: processNames.filter((p) => p.name?.trim()).map((p) => p.name),
        process_descriptions: processNames
          .filter((p) => p.name?.trim())
          .map((p) => ({ name: p.name, description: p.description || '' })),
      },
    };
  });

  return { endpoint: '/emissions/c7/month', monthlyReportingYear, payloads };
}

/**
 * Top-level CREATE entry — picks yearly vs monthly based on
 * `frequencyType` and returns either a single yearly payload or a list
 * of monthly payloads.
 *
 * NOTE: This DOES NOT post — caller is responsible for axios + auth.
 * Returns either:
 *   { mode: 'yearly', endpoint, reportingPeriod, payload }
 *   { mode: 'monthly', endpoint, monthlyReportingYear, payloads: [{monthKey, payload, monthCo2e}] }
 */
export function buildCreatePayload(_ignored, ctx) {
  if (ctx.frequencyType === 'yearly') {
    const { endpoint, reportingPeriod, payload } = buildYearlyCreatePayload(ctx);
    return { mode: 'yearly', endpoint, reportingPeriod, payload };
  }
  const { endpoint, monthlyReportingYear, payloads } = buildMonthlyCreatePayloads(ctx);
  return { mode: 'monthly', endpoint, monthlyReportingYear, payloads };
}

/**
 * Top-level CREATE validator — picks yearly vs monthly.
 */
export function validateCreateSubmission(ctx) {
  if (ctx.frequencyType === 'yearly') {
    return validateYearlyCreateSubmission(ctx);
  }
  return validateMonthlyCreateSubmission(ctx);
}

export const createApi = {
  validateCreateSubmission,
  buildCreatePayload,
  validateYearlyCreateSubmission,
  validateMonthlyCreateSubmission,
  buildYearlyCreatePayload,
  buildMonthlyCreatePayloads,
};

export default createApi;
