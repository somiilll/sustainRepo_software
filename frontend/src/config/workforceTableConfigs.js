/**
 * Workforce Table Configurations — config-driven table definitions.
 * Each config maps table rows/columns to KPI field_value keys.
 */

const FML_COLS = [
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
  { key: 'total', label: 'Total' },
];

const DIVERSITY_VALIDATIONS = (totalKey) => [
  { type: 'sum_equals', rows: [`${totalKey}_age_under_30`, `${totalKey}_age_30_50`, `${totalKey}_age_over_50`], target: `${totalKey}_total` },
  { type: 'less_than_or_equal', row: `${totalKey}_minority`, target: `${totalKey}_total` },
  { type: 'less_than_or_equal', row: `${totalKey}_vulnerable`, target: `${totalKey}_total` },
];

const DIVERSITY_ROWS = (prefix, label) => [
  { key: `${prefix}_total`, label: `Total ${label}` },
  { key: `${prefix}_permanent`, label: `Permanent ${label}` },
  { key: `${prefix}_temporary`, label: `Temporary ${label}` },
  { key: `${prefix}_contract`, label: `Contract ${label}` },
  { key: `${prefix}_age_under_30`, label: 'Age < 30' },
  { key: `${prefix}_age_30_50`, label: 'Age 30–50' },
  { key: `${prefix}_age_over_50`, label: 'Age > 50' },
  { key: `${prefix}_minority`, label: 'Belonging to Minority' },
  { key: `${prefix}_vulnerable`, label: 'Belonging to Vulnerable Groups' },
];

export const EMPLOYEE_DIVERSITY_CONFIG = {
  key: 'employee_diversity',
  title: 'Employee Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'emp_total', label: 'Total Employees' },
    { key: 'emp_permanent', label: 'Permanent Employees' },
    { key: 'emp_temporary', label: 'Temporary Employees' },
    { key: 'emp_contract', label: 'Contract Employees' },
    { key: 'emp_part_time', label: 'Part-Time Employees' },
    { key: 'emp_intern_trainee', label: 'Intern / Trainee' },
    { key: 'emp_age_under_30', label: 'Age < 30' },
    { key: 'emp_age_30_50', label: 'Age 30–50' },
    { key: 'emp_age_over_50', label: 'Age > 50' },
    { key: 'emp_minority', label: 'Belonging to Minority' },
    { key: 'emp_vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    emp_total: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES', male: 'SOC_NO_OF_MALE_EMPLOYEES', total: 'SOC_NO_OF_EMPLOYEES' },
    emp_permanent: { female: 'SOC_NO_OF_FEMALE_PERMANENT_EMPLOYEES', male: 'SOC_NO_OF_MALE_PERMANENT_EMPLOYEES' },
    emp_temporary: { female: 'SOC_NO_OF_FEMALE_TEMPORARY_EMPLOYEES', male: 'SOC_NO_OF_MALE_TEMPORARY_EMPLOYEES' },
    emp_contract: { female: 'SOC_NO_OF_FEMALE_CONTRACT_EMPLOYEES', male: 'SOC_NO_OF_MALE_CONTRACT_EMPLOYEES' },
    emp_part_time: { female: 'SOC_NO_OF_FEMALE_PARTTIME_EMPLOYEES', male: 'SOC_NO_OF_MALE_PARTTIME_EMPLOYEES' },
    emp_intern_trainee: { female: 'SOC_NO_OF_FEMALE_INTERNTRAINEE_EMPLOYEES', male: 'SOC_NO_OF_MALE_INTERNTRAINEE_EMPLOYEES' },
    emp_age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_UNDER_30' },
    emp_age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_3050' },
    emp_age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_OVER_50' },
    emp_minority: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_MINORITY_1' },
    emp_vulnerable: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_VULNERABLE__1' },
  },
  validations: [
    { type: 'sum_equals', rows: ['emp_age_under_30', 'emp_age_30_50', 'emp_age_over_50'], target: 'emp_total' },
    { type: 'less_than_or_equal', row: 'emp_minority', target: 'emp_total' },
    { type: 'less_than_or_equal', row: 'emp_vulnerable', target: 'emp_total' },
  ],
};

export const WORKER_DIVERSITY_CONFIG = {
  key: 'worker_diversity',
  title: 'Worker Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'wrk_total', label: 'Total Workers' },
    { key: 'wrk_permanent', label: 'Permanent Workers' },
    { key: 'wrk_temporary', label: 'Temporary Workers' },
    { key: 'wrk_contract', label: 'Contract Workers' },
    { key: 'wrk_age_under_30', label: 'Age < 30' },
    { key: 'wrk_age_30_50', label: 'Age 30–50' },
    { key: 'wrk_age_over_50', label: 'Age > 50' },
    { key: 'wrk_minority', label: 'Belonging to Minority' },
    { key: 'wrk_vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    wrk_total: { female: 'SOC_NO_OF_FEMALE_WORKERS', male: 'SOC_NO_OF_MALE_WORKERS', total: 'SOC_NO_OF_WORKERS' },
    wrk_permanent: { female: 'SOC_NO_OF_FEMALE_PERMANENT_WORKERS', male: 'SOC_NO_OF_MALE_PERMANENT_WORKERS' },
    wrk_temporary: { female: 'SOC_NO_OF_FEMALE_TEMPORARY_WORKERS', male: 'SOC_NO_OF_MALE_TEMPORARY_WORKERS' },
    wrk_contract: { female: 'SOC_NO_OF_FEMALE_CONTRACT_WORKERS', male: 'SOC_NO_OF_MALE_CONTRACT_WORKERS' },
    wrk_age_under_30: { total: 'SOC_NO_OF_WORKERS_UNDER_30' },
    wrk_age_30_50: { total: 'SOC_NO_OF_WORKERS_3050' },
    wrk_age_over_50: { total: 'SOC_NO_OF_WORKERS_OVER_50' },
    wrk_minority: { total: 'SOC_NO_OF_WORKERS_MINORITY' },
    wrk_vulnerable: { total: 'SOC_NO_OF_WORKERS_VULNERABLE' },
  },
  validations: [
    { type: 'sum_equals', rows: ['wrk_age_under_30', 'wrk_age_30_50', 'wrk_age_over_50'], target: 'wrk_total' },
    { type: 'less_than_or_equal', row: 'wrk_minority', target: 'wrk_total' },
    { type: 'less_than_or_equal', row: 'wrk_vulnerable', target: 'wrk_total' },
  ],
};

export const GOVERNANCE_DIVERSITY_CONFIG = {
  key: 'governance_diversity',
  title: 'Governance Bodies Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'gov_total', label: 'Total in Governance Bodies' },
    { key: 'gov_age_under_30', label: 'Age < 30' },
    { key: 'gov_age_30_50', label: 'Age 30–50' },
    { key: 'gov_age_over_50', label: 'Age > 50' },
    { key: 'gov_minority', label: 'Belonging to Minority' },
    { key: 'gov_vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    gov_total: { female: 'SOC_NO_OF_FEMALE_IN_GOVERNANCE_BODIES', male: 'SOC_NO_OF_MALE_IN_GOVERNANCE_BODIES', total: 'SOC_NO_OF_EMPLOYEES_IN_GOVERNANCE_BODIES' },
    gov_age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_UNDER_30_IN_GOVERNANCE_B' },
    gov_age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_3050_IN_GOVERNANCE_BODIE' },
    gov_age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_OVER_50_IN_GOVERNANCE_BO' },
    gov_minority: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_MINORITY' },
    gov_vulnerable: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_VULNERABLE_' },
  },
  validations: [
    { type: 'sum_equals', rows: ['gov_age_under_30', 'gov_age_30_50', 'gov_age_over_50'], target: 'gov_total' },
    { type: 'less_than_or_equal', row: 'gov_minority', target: 'gov_total' },
    { type: 'less_than_or_equal', row: 'gov_vulnerable', target: 'gov_total' },
  ],
};

export const BOD_DIVERSITY_CONFIG = {
  key: 'bod_diversity',
  title: 'Board of Directors Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'bod_total', label: 'Total Board of Directors' },
    { key: 'bod_age_under_30', label: 'Age < 30' },
    { key: 'bod_age_30_50', label: 'Age 30–50' },
    { key: 'bod_age_over_50', label: 'Age > 50' },
    { key: 'bod_minority', label: 'Belonging to Minority' },
    { key: 'bod_vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    bod_total: { female: 'SOC_NO_OF_FEMALE_BOD', male: 'SOC_NO_OF_MALE_BOD', total: 'SOC_NO_OF_BOD' },
    bod_age_under_30: { total: 'SOC_NO_OF_BOD_UNDER_30' },
    bod_age_30_50: { total: 'SOC_NO_OF_BOD_3050' },
    bod_age_over_50: { total: 'SOC_NO_OF_BOD_OVER_50' },
    bod_minority: { total: 'SOC_NO_OF_BOD_MINORITY' },
    bod_vulnerable: { total: 'SOC_NO_OF_BOD_VULNERABLE' },
  },
  validations: [
    { type: 'sum_equals', rows: ['bod_age_under_30', 'bod_age_30_50', 'bod_age_over_50'], target: 'bod_total' },
    { type: 'less_than_or_equal', row: 'bod_minority', target: 'bod_total' },
    { type: 'less_than_or_equal', row: 'bod_vulnerable', target: 'bod_total' },
  ],
};

export const KMP_DIVERSITY_CONFIG = {
  key: 'kmp_diversity',
  title: 'Key Management Personnel Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'kmp_total', label: 'Total KMP' },
    { key: 'kmp_age_under_30', label: 'Age < 30' },
    { key: 'kmp_age_30_50', label: 'Age 30–50' },
    { key: 'kmp_age_over_50', label: 'Age > 50' },
    { key: 'kmp_minority', label: 'Belonging to Minority' },
    { key: 'kmp_vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    kmp_total: { female: 'SOC_NO_OF_FEMALE_KMP', male: 'SOC_NO_OF_MALE_KMP', total: 'SOC_NO_OF_KMP' },
    kmp_age_under_30: { total: 'SOC_NO_OF_KMP_UNDER_30' },
    kmp_age_30_50: { total: 'SOC_NO_OF_KMP_3050' },
    kmp_age_over_50: { total: 'SOC_NO_OF_KMP_OVER_50' },
    kmp_minority: { total: 'SOC_NO_OF_KMP_MINORITY' },
    kmp_vulnerable: { total: 'SOC_NO_OF_KMP_VULNERABLE' },
  },
  validations: [
    { type: 'sum_equals', rows: ['kmp_age_under_30', 'kmp_age_30_50', 'kmp_age_over_50'], target: 'kmp_total' },
    { type: 'less_than_or_equal', row: 'kmp_minority', target: 'kmp_total' },
    { type: 'less_than_or_equal', row: 'kmp_vulnerable', target: 'kmp_total' },
  ],
};

export const EMPLOYEE_TURNOVER_CONFIG = {
  key: 'employee_turnover',
  title: 'Employee Turnover',
  columns: [
    { key: 'female', label: 'Female' },
    { key: 'male', label: 'Male' },
    { key: 'total', label: 'Total' },
    { key: 'rate', label: 'Rate (%)' },
  ],
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'et_turnover', label: 'Employee Turnover' },
    { key: 'et_age_under_30', label: 'Turnover — Age < 30' },
    { key: 'et_age_30_50', label: 'Turnover — Age 30–50' },
    { key: 'et_age_over_50', label: 'Turnover — Age > 50' },
  ],
  fieldMap: {
    et_turnover: { female: 'SOC_NO_OF_FEMALE_TURNOVER', male: 'SOC_NO_OF_MALE_TURNOVER', total: 'SOC_NO_OF_EMPLOYEES_TURNOVER', rate: 'SOC_EMPLOYEES_TURNOVER_RATE' },
    et_age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_UNDER_' },
    et_age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_3050' },
    et_age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_OVER_5' },
  },
  validations: [
    { type: 'sum_equals', rows: ['et_age_under_30', 'et_age_30_50', 'et_age_over_50'], target: 'et_turnover' },
  ],
};

export const WORKER_TURNOVER_CONFIG = {
  key: 'worker_turnover',
  title: 'Worker Turnover',
  columns: [
    { key: 'female', label: 'Female' },
    { key: 'male', label: 'Male' },
    { key: 'total', label: 'Total' },
    { key: 'rate', label: 'Rate (%)' },
  ],
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'wt_turnover', label: 'Worker Turnover' },
    { key: 'wt_age_under_30', label: 'Turnover — Age < 30' },
    { key: 'wt_age_30_50', label: 'Turnover — Age 30–50' },
    { key: 'wt_age_over_50', label: 'Turnover — Age > 50' },
  ],
  fieldMap: {
    wt_turnover: { female: 'SOC_NO_OF_FEMALE_WORKERS_TURNOVER', male: 'SOC_NO_OF_MALE_WORKERS_TURNOVER', total: 'SOC_NO_OF_WORKERS_TURNOVER', rate: 'SOC_WORKERS_TURNOVER_RATE' },
    wt_age_under_30: { total: 'SOC_NO_OF_WORKERS_TURNOVER_UNDER_30' },
    wt_age_30_50: { total: 'SOC_NO_OF_WORKERS_TURNOVER_3050' },
    wt_age_over_50: { total: 'SOC_NO_OF_WORKERS_TURNOVER_OVER_50' },
  },
  validations: [
    { type: 'sum_equals', rows: ['wt_age_under_30', 'wt_age_30_50', 'wt_age_over_50'], target: 'wt_turnover' },
  ],
};

export const EMPLOYEE_PARENTAL_LEAVE_CONFIG = {
  key: 'employee_parental_leave',
  title: 'Employee Parental Leave',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }],
  autoCalculate: {},
  rows: [
    { key: 'epl_entitled', label: 'Entitled to Parental Leave' },
    { key: 'epl_took', label: 'Took Parental Leave' },
    { key: 'epl_returned', label: 'Returned to Work' },
    { key: 'epl_retained', label: 'Retained After 12 Months' },
  ],
  fieldMap: {
    epl_entitled: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES_ENTITLED_TO_PAREN', male: 'SOC_NO_OF_MALE_EMPLOYEES_ENTITLED_TO_PARENTA' },
    epl_took: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES_WHO_TOOK_PARENTAL', male: 'SOC_NO_OF_MALE_EMPLOYEES_WHO_TOOK_PARENTAL_L' },
    epl_returned: { female: 'SOC_FEMALE_EMPLOYEES_WHO_RETURNED_TO_WORK', male: 'SOC_MALE_EMPLOYEES_WHO_RETURNED_TO_WORK' },
    epl_retained: { female: 'SOC_FEMALE_EMPLOYEES_RETAINED_AFTER_12_MONTH', male: 'SOC_MALE_EMPLOYEES_RETAINED_AFTER_12_MONTHS' },
  },
  validations: [
    { type: 'less_than_or_equal', row: 'epl_took', target: 'epl_entitled' },
    { type: 'less_than_or_equal', row: 'epl_returned', target: 'epl_took' },
    { type: 'less_than_or_equal', row: 'epl_retained', target: 'epl_returned' },
  ],
};

export const WORKER_PARENTAL_LEAVE_CONFIG = {
  key: 'worker_parental_leave',
  title: 'Worker Parental Leave',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }],
  autoCalculate: {},
  rows: [
    { key: 'wpl_entitled', label: 'Entitled to Parental Leave' },
    { key: 'wpl_took', label: 'Took Parental Leave' },
    { key: 'wpl_returned', label: 'Returned to Work' },
    { key: 'wpl_retained', label: 'Retained After 12 Months' },
  ],
  fieldMap: {
    wpl_entitled: { female: 'SOC_NO_OF_FEMALE_WORKERS_ENTITLED_PARENTAL', male: 'SOC_NO_OF_MALE_WORKERS_ENTITLED_PARENTAL' },
    wpl_took: { female: 'SOC_NO_OF_FEMALE_WORKERS_TOOK_PARENTAL', male: 'SOC_NO_OF_MALE_WORKERS_TOOK_PARENTAL' },
    wpl_returned: { female: 'SOC_FEMALE_WORKERS_RETURNED_WORK', male: 'SOC_MALE_WORKERS_RETURNED_WORK' },
    wpl_retained: { female: 'SOC_FEMALE_WORKERS_RETAINED_12M', male: 'SOC_MALE_WORKERS_RETAINED_12M' },
  },
  validations: [
    { type: 'less_than_or_equal', row: 'wpl_took', target: 'wpl_entitled' },
    { type: 'less_than_or_equal', row: 'wpl_returned', target: 'wpl_took' },
    { type: 'less_than_or_equal', row: 'wpl_retained', target: 'wpl_returned' },
  ],
};

export const ALL_WORKFORCE_CONFIGS = [
  EMPLOYEE_DIVERSITY_CONFIG,
  WORKER_DIVERSITY_CONFIG,
  BOD_DIVERSITY_CONFIG,
  KMP_DIVERSITY_CONFIG,
  EMPLOYEE_TURNOVER_CONFIG,
  WORKER_TURNOVER_CONFIG,
  EMPLOYEE_PARENTAL_LEAVE_CONFIG,
  WORKER_PARENTAL_LEAVE_CONFIG,
];
