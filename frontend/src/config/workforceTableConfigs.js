/**
 * Workforce Table Configurations — config-driven table definitions.
 * Each config maps table rows/columns to KPI field_value keys.
 */

const FML_COLS = [
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
  { key: 'total', label: 'Total' },
];

export const EMPLOYEE_DIVERSITY_CONFIG = {
  key: 'employee_diversity',
  title: 'Employee Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'total_employees', label: 'Total Employees' },
    { key: 'permanent', label: 'Permanent Employees' },
    { key: 'temporary', label: 'Temporary Employees' },
    { key: 'contract', label: 'Contract Employees' },
    { key: 'part_time', label: 'Part-Time Employees' },
    { key: 'intern_trainee', label: 'Intern / Trainee' },
    { key: 'age_under_30', label: 'Age < 30' },
    { key: 'age_30_50', label: 'Age 30–50' },
    { key: 'age_over_50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total_employees: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES', male: 'SOC_NO_OF_MALE_EMPLOYEES', total: 'SOC_NO_OF_EMPLOYEES' },
    permanent: { female: 'SOC_NO_OF_FEMALE_PERMANENT_EMPLOYEES', male: 'SOC_NO_OF_MALE_PERMANENT_EMPLOYEES' },
    temporary: { female: 'SOC_NO_OF_FEMALE_TEMPORARY_EMPLOYEES', male: 'SOC_NO_OF_MALE_TEMPORARY_EMPLOYEES' },
    contract: { female: 'SOC_NO_OF_FEMALE_CONTRACT_EMPLOYEES', male: 'SOC_NO_OF_MALE_CONTRACT_EMPLOYEES' },
    part_time: { female: 'SOC_NO_OF_FEMALE_PARTTIME_EMPLOYEES', male: 'SOC_NO_OF_MALE_PARTTIME_EMPLOYEES' },
    intern_trainee: { female: 'SOC_NO_OF_FEMALE_INTERNTRAINEE_EMPLOYEES', male: 'SOC_NO_OF_MALE_INTERNTRAINEE_EMPLOYEES' },
    age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_UNDER_30' },
    age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_3050' },
    age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_OVER_50' },
    minority: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_MINORITY_1' },
    vulnerable: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_VULNERABLE__1' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_under_30', 'age_30_50', 'age_over_50'], target: 'total_employees' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total_employees' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total_employees' },
  ],
};

export const GOVERNANCE_DIVERSITY_CONFIG = {
  key: 'governance_diversity',
  title: 'Board / Governance Bodies Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'total', label: 'Total in Governance Bodies' },
    { key: 'age_under_30', label: 'Age < 30' },
    { key: 'age_30_50', label: 'Age 30–50' },
    { key: 'age_over_50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total: { female: 'SOC_NO_OF_FEMALE_IN_GOVERNANCE_BODIES', male: 'SOC_NO_OF_MALE_IN_GOVERNANCE_BODIES', total: 'SOC_NO_OF_EMPLOYEES_IN_GOVERNANCE_BODIES' },
    age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_UNDER_30_IN_GOVERNANCE_B' },
    age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_3050_IN_GOVERNANCE_BODIE' },
    age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_OVER_50_IN_GOVERNANCE_BO' },
    minority: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_MINORITY' },
    vulnerable: { total: 'SOC_NO_OF_EMPLOYEES_BELONGING_TO_VULNERABLE_' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_under_30', 'age_30_50', 'age_over_50'], target: 'total' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total' },
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
    { key: 'turnover', label: 'Employee Turnover' },
    { key: 'age_under_30', label: 'Turnover — Age < 30' },
    { key: 'age_30_50', label: 'Turnover — Age 30–50' },
    { key: 'age_over_50', label: 'Turnover — Age > 50' },
  ],
  fieldMap: {
    turnover: { female: 'SOC_NO_OF_FEMALE_TURNOVER', male: 'SOC_NO_OF_MALE_TURNOVER', total: 'SOC_NO_OF_EMPLOYEES_TURNOVER', rate: 'SOC_EMPLOYEES_TURNOVER_RATE' },
    age_under_30: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_UNDER_' },
    age_30_50: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_3050' },
    age_over_50: { total: 'SOC_NO_OF_EMPLOYEES_TURNOVER_WHO_WERE_OVER_5' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_under_30', 'age_30_50', 'age_over_50'], target: 'turnover' },
  ],
};

export const PARENTAL_LEAVE_CONFIG = {
  key: 'parental_leave',
  title: 'Parental Leave',
  columns: [
    { key: 'female', label: 'Female' },
    { key: 'male', label: 'Male' },
  ],
  autoCalculate: {},
  rows: [
    { key: 'entitled', label: 'Employees Entitled to Parental Leave' },
    { key: 'took_leave', label: 'Employees Who Took Parental Leave' },
    { key: 'returned', label: 'Employees Who Returned to Work' },
    { key: 'retained', label: 'Retained After 12 Months' },
  ],
  fieldMap: {
    entitled: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES_ENTITLED_TO_PAREN', male: 'SOC_NO_OF_MALE_EMPLOYEES_ENTITLED_TO_PARENTA' },
    took_leave: { female: 'SOC_NO_OF_FEMALE_EMPLOYEES_WHO_TOOK_PARENTAL', male: 'SOC_NO_OF_MALE_EMPLOYEES_WHO_TOOK_PARENTAL_L' },
    returned: { female: 'SOC_FEMALE_EMPLOYEES_WHO_RETURNED_TO_WORK', male: 'SOC_MALE_EMPLOYEES_WHO_RETURNED_TO_WORK' },
    retained: { female: 'SOC_FEMALE_EMPLOYEES_RETAINED_AFTER_12_MONTH', male: 'SOC_MALE_EMPLOYEES_RETAINED_AFTER_12_MONTHS' },
  },
  validations: [
    { type: 'less_than_or_equal', row: 'took_leave', target: 'entitled' },
    { type: 'less_than_or_equal', row: 'returned', target: 'took_leave' },
    { type: 'less_than_or_equal', row: 'retained', target: 'returned' },
  ],
};

export const ALL_WORKFORCE_CONFIGS = [
  EMPLOYEE_DIVERSITY_CONFIG,
  GOVERNANCE_DIVERSITY_CONFIG,
  EMPLOYEE_TURNOVER_CONFIG,
  PARENTAL_LEAVE_CONFIG,
];
