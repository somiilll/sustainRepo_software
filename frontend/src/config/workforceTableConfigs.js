/**
 * Workforce Table Configurations — maps to esg_record_categories field_keys.
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
    { key: 'total', label: 'Total Employees' },
    { key: 'permanent', label: 'Permanent Employees' },
    { key: 'temporary', label: 'Temporary Employees' },
    { key: 'contract', label: 'Contract Employees' },
    { key: 'part_time', label: 'Part-Time Employees' },
    { key: 'intern', label: 'Intern / Trainee' },
    { key: 'age_u30', label: 'Age < 30' },
    { key: 'age_3050', label: 'Age 30–50' },
    { key: 'age_o50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total:      { female: 'no_of_female', male: 'no_of_male', total: 'no_of_employees' },
    permanent:  { female: 'no_of_female_permanent_employees', male: 'no_of_male_permanent_employees', total: 'no_of_permanent_employees' },
    temporary:  { female: 'no_of_female_temporary_employees', male: 'no_of_male_temporary_employees', total: 'no_of_temporary_employees' },
    contract:   { female: 'no_of_female_contract_employees', male: 'no_of_male_contract_employees', total: 'no_of_contract_employees' },
    part_time:  { female: 'no_of_female_part_time_employees', male: 'no_of_male_part_time_employees', total: 'no_of_part_time_employees' },
    intern:     { female: 'no_of_female_intern_trainee', male: 'no_of_male_intern_trainee', total: 'no_of_intern_trainee' },
    age_u30:    { female: 'no_of_female_employees_age_under_30', male: 'no_of_male_employees_age_under_30', total: 'no_of_employees_under_30' },
    age_3050:   { female: 'no_of_female_employees_age_30_50', male: 'no_of_male_employees_age_30_50', total: 'no_of_employees_30_50' },
    age_o50:    { female: 'no_of_female_employees_age_over_50', male: 'no_of_male_employees_age_over_50', total: 'no_of_employees_over_50' },
    minority:   { female: 'no_of_female_employees_belonging_to_minority', male: 'no_of_male_employees_belonging_to_minority', total: 'no_of_employees_minority' },
    vulnerable: { female: 'no_of_female_employees_belonging_to_vulnerable_groups', male: 'no_of_male_employees_belonging_to_vulnerable_groups', total: 'no_of_employees_vulnerable_groups' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_u30', 'age_3050', 'age_o50'], target: 'total' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total' },
  ],
};

export const WORKER_DIVERSITY_CONFIG = {
  key: 'worker_diversity',
  title: 'Workers Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'total', label: 'Total Workers' },
    { key: 'age_u30', label: 'Age < 30' },
    { key: 'age_3050', label: 'Age 30–50' },
    { key: 'age_o50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total:      { female: 'no_of_female_workers', male: 'no_of_male_workers', total: 'no_of_workers' },
    age_u30:    { female: 'no_of_female_workers_age_under_30', male: 'no_of_male_workers_age_under_30', total: 'no_of_workers_under_30' },
    age_3050:   { female: 'no_of_female_workers_age_30_50', male: 'no_of_male_workers_age_30_50', total: 'no_of_workers_30_50' },
    age_o50:    { female: 'no_of_female_workers_age_over_50', male: 'no_of_male_workers_age_over_50', total: 'no_of_workers_over_50' },
    minority:   { female: 'no_of_female_workers_belonging_to_minority', male: 'no_of_male_workers_belonging_to_minority', total: 'no_of_workers_belonging_to_minority' },
    vulnerable: { female: 'no_of_female_workers_belonging_to_vulnerable_groups', male: 'no_of_male_workers_belonging_to_vulnerable_groups', total: 'no_of_workers_belonging_to_vulnerable_groups' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_u30', 'age_3050', 'age_o50'], target: 'total' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total' },
  ],
};

export const BOD_DIVERSITY_CONFIG = {
  key: 'bod_diversity',
  title: 'Board of Directors Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'total', label: 'Total' },
    { key: 'age_u30', label: 'Age < 30' },
    { key: 'age_3050', label: 'Age 30–50' },
    { key: 'age_o50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total:      { female: 'no_of_female', male: 'no_of_male' },
    age_u30:    { female: 'no_of_female_employees_under_30', male: 'no_of_male_employees_under_30', total: 'no_of_employees_under_30' },
    age_3050:   { female: 'no_of_female_employees_age_30_50', male: 'no_of_male_employees_age_30_50', total: 'no_of_employees_age_30_50' },
    age_o50:    { female: 'no_of_female_employees_over_50', male: 'no_of_male_employees_over_50', total: 'no_of_employees_over_50' },
    minority:   { female: 'no_of_female_employees_belonging_to_minority', male: 'no_of_male_employees_belonging_to_minority', total: 'no_of_employees_belonging_to_minority' },
    vulnerable: { female: 'no_of_female_employees_belonging_to_vulnerable_groups', male: 'no_of_male_employees_belonging_to_vulnerable_groups', total: 'no_of_employees_belonging_to_vulnerable_groups' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_u30', 'age_3050', 'age_o50'], target: 'total' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total' },
  ],
};

export const KMP_DIVERSITY_CONFIG = {
  key: 'kmp_diversity',
  title: 'Key Management Personnel Diversity',
  columns: FML_COLS,
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'total', label: 'Total KMP' },
    { key: 'age_u30', label: 'Age < 30' },
    { key: 'age_3050', label: 'Age 30–50' },
    { key: 'age_o50', label: 'Age > 50' },
    { key: 'minority', label: 'Belonging to Minority' },
    { key: 'vulnerable', label: 'Belonging to Vulnerable Groups' },
  ],
  fieldMap: {
    total:      { female: 'no_of_female', male: 'no_of_male' },
    age_u30:    { female: 'no_of_female_employees_under_30', male: 'no_of_male_employees_under_30', total: 'no_of_employees_under_30' },
    age_3050:   { female: 'no_of_female_employees_age_30_50', male: 'no_of_male_employees_age_30_50', total: 'no_of_employees_30_50' },
    age_o50:    { female: 'no_of_female_employees_over_50', male: 'no_of_male_employees_over_50', total: 'no_of_employees_over_50' },
    minority:   { female: 'no_of_female_employees_belonging_to_minority', male: 'no_of_male_employees_belonging_to_minority', total: 'no_of_employees_minority' },
    vulnerable: { female: 'no_of_female_employees_belonging_to_vulnerable_groups', male: 'no_of_male_employees_belonging_to_vulnerable_groups', total: 'no_of_employees_vulnerable_groups' },
  },
  validations: [
    { type: 'sum_equals', rows: ['age_u30', 'age_3050', 'age_o50'], target: 'total' },
    { type: 'less_than_or_equal', row: 'minority', target: 'total' },
    { type: 'less_than_or_equal', row: 'vulnerable', target: 'total' },
  ],
};

export const EMPLOYEE_TURNOVER_CONFIG = {
  key: 'employee_turnover',
  title: 'Employee Turnover',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }, { key: 'total', label: 'Total' }],
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'start', label: 'At Start of Year' },
    { key: 'end', label: 'At End of Year' },
    { key: 'left', label: 'Left During Period' },
  ],
  fieldMap: {
    start: { female: 'female_employees_at_the_start_of_the_year', male: 'male_employees_at_the_start_of_the_year', total: 'employees_at_the_start_of_the_year' },
    end:   { female: 'female_employees_at_the_end_of_the_year', male: 'male_employees_at_the_end_of_the_year', total: 'employees_at_the_end_of_the_year' },
    left:  { female: 'female_employees_who_left_during_the_reporting_period', male: 'male_employees_who_left_during_the_reporting_period', total: 'employees_who_left_during_the_reporting_period' },
  },
  validations: [],
};

export const WORKER_TURNOVER_CONFIG = {
  key: 'worker_turnover',
  title: 'Workers Turnover',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }, { key: 'total', label: 'Total' }],
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'start', label: 'At Start of Year' },
    { key: 'end', label: 'At End of Year' },
    { key: 'left', label: 'Left During Period' },
  ],
  fieldMap: {
    start: { female: 'female_workers_at_the_start_of_the_year', male: 'male_workers_at_the_start_of_the_year', total: 'workers_at_the_start_of_the_year' },
    end:   { female: 'female_workers_at_the_end_of_the_year', male: 'male_workers_at_the_end_of_the_year', total: 'workers_at_the_end_of_the_year' },
    left:  { female: 'female_workers_who_left_during_the_reporting_period', male: 'male_workers_who_left_during_the_reporting_period', total: 'workers_who_left_during_the_reporting_period' },
  },
  validations: [],
};

export const EMPLOYEE_PARENTAL_LEAVE_CONFIG = {
  key: 'employee_parental_leave',
  title: 'Employees Parental Leave',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }],
  autoCalculate: {},
  rows: [
    { key: 'took', label: 'Took Parental Leave' },
    { key: 'returned', label: 'Returned to Work' },
    { key: 'due_return', label: 'Due to Return After Leave' },
    { key: 'retained', label: 'Retained After 12 Months' },
  ],
  fieldMap: {
    took:       { female: 'no_of_female_employee_took_leave', male: 'no_of_male_employee_took_leave' },
    returned:   { female: 'female_employees_who_returned_to_work', male: 'male_employees_who_returned_to_work' },
    due_return: { female: 'female_employees_number_of_employees_that_are_due_to_return_to_work_after_taking_parental_leave', male: 'male_employees_number_of_employees_that_are_due_to_return_to_work_after_taking_parental_leave' },
    retained:   { female: 'female_employees_retained_after_12_months', male: 'male_employees_retained_after_12_months' },
  },
  validations: [
    { type: 'less_than_or_equal', row: 'returned', target: 'took' },
    { type: 'less_than_or_equal', row: 'retained', target: 'returned' },
  ],
};

export const WORKER_PARENTAL_LEAVE_CONFIG = {
  key: 'worker_parental_leave',
  title: 'Workers Parental Leave',
  columns: [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }],
  autoCalculate: {},
  rows: [
    { key: 'took', label: 'Took Parental Leave' },
    { key: 'returned', label: 'Returned to Work' },
    { key: 'due_return', label: 'Due to Return After Leave' },
    { key: 'retained', label: 'Retained After 12 Months' },
  ],
  fieldMap: {
    took:       { female: 'no_of_female_workers_that_took_leave', male: 'no_of_male_workers_took_leave' },
    returned:   { female: 'female_workers_who_returned_to_work', male: 'male_workers_who_returned_to_work' },
    due_return: { female: 'female_workers_that_are_due_to_return_to_work_after_taking_parental_leave', male: 'male_workers_that_are_due_to_return_to_work_after_taking_parental_leave' },
    retained:   { female: 'female_workers_retained_after_12_months', male: 'male_workers_retained_after_12_months' },
  },
  validations: [
    { type: 'less_than_or_equal', row: 'returned', target: 'took' },
    { type: 'less_than_or_equal', row: 'retained', target: 'returned' },
  ],
};


export const GENERAL_TRAINING_CONFIG = {
  key: 'general_training',
  title: 'General Training',
  dropdownFields: [
    { key: 'training_attendes_type', label: 'Who was the training for?', options: ['Board of Directors', 'Key Management Personal', 'Employees', 'Workers', 'Vendors', 'Contractors'] },
    { key: 'employee_worker_type', label: 'Employee/Worker Type', options: ['Permanent', 'Other than Permanent'] },
  ],
  columns: [
    { key: 'count', label: '# Trainings' },
    { key: 'female', label: 'Female Attendees' },
    { key: 'male', label: 'Male Attendees' },
    { key: 'total', label: 'Total Attendees' },
  ],
  autoCalculate: { total: ['female', 'male'] },
  rows: [
    { key: 'overall', label: 'Overall' },
    { key: 'health_safety', label: 'Health & Safety' },
    { key: 'environment', label: 'Environment' },
    { key: 'human_rights', label: 'Human Right Issues' },
    { key: 'org_policy', label: 'Organization Policy(ies)' },
    { key: 'skill_upgrade', label: 'Skill Upgrade / Up-skilling' },
    { key: 'reskilling', label: 'Re-skilling' },
    { key: 'anti_corruption', label: 'Anti-corruption' },
    { key: 'ethical', label: 'Ethical Principles' },
  ],
  fieldMap: {
    overall:        { count: 'no_of_trainings_done', female: 'no_of_female_attendees', male: 'no_of_male_attendees' },
    health_safety:  { count: 'no_of_trainings_on_health_safety', female: 'no_of_female_attendees_for_training_on_health_safety', male: 'no_of_male_attendees_for_training_on_health_safety' },
    environment:    { count: 'no_of_trainings_on_environment', female: 'no_of_female_attendees_for_training_on_environment', male: 'no_of_male_attendees_for_training_on_environment' },
    human_rights:   { count: 'no_of_trainings_on_human_right_issues', female: 'no_of_female_attendees_for_trainings_on_human_right_issues', male: 'no_of_male_attendees_trainings_on_human_right_issues' },
    org_policy:     { count: 'no_of_trainings_on_organization_policy_ies', female: 'no_of_female_attendees_for_trainings_on_organization_policy_ies', male: 'no_of_male_attendees_for_trainings_on_organization_policy_ies' },
    skill_upgrade:  { count: 'no_of_trainings_on_skill_upgrade_up_skilling', female: 'no_of_female_attendees_for_trainings_on_skill_upgrade_up_skilling', male: 'no_of_male_attendees_for_trainings_on_skill_upgrade_up_skilling' },
    reskilling:     { count: 'no_of_trainings_on_re_skilling', female: 'no_of_female_attendees_for_trainings_on_re_skilling', male: 'no_of_male_attendees_for_trainings_on_re_skilling' },
    anti_corruption:{ count: 'no_of_trainings_on_anti_corruption', female: 'no_of_female_attendees_for_trainings_on_anti_corruption', male: 'no_of_male_attendees_for_trainings_on_anti_corruption' },
    ethical:        { count: 'no_of_trainings_on_ethical_principles', female: 'no_of_female_attendees_for_trainings_on_ethical_principles', male: 'no_of_male_attendees_for_trainings_on_ethical_principles' },
  },
  validations: [],
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
