/**
 * BRSRSectionC — Section C: Principle-wise Performance Disclosures
 *
 * Fetches ALL questions from environment + social + governance,
 * groups them by brsr_principle (P1-P9), renders collapsible sections.
 * Each question has individual save/draft, status badges, and version history.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { QuestionRenderer } from './ESGQuestionnaire';
import { useLinkedFrameworks } from '../modules/framework-links';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Loader2, Save, CheckCircle2, AlertCircle, ChevronDown, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { QuestionVersionHistory } from './QuestionVersionHistory';
import { mergeBRSRAutofill } from '../utils/brsrAutofill';


const hasReportableValue = (v) => {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.some(hasReportableValue);
  if (typeof v === 'object') return Object.values(v).some(hasReportableValue);
  return true;
};

const API = process.env.REACT_APP_BACKEND_URL;

const SECTION = 'section_c';

const PRINCIPLE_META = {
  P1: { name: 'Principle 1', title: 'Ethics, Transparency & Accountability' },
  P2: { name: 'Principle 2', title: 'Sustainable Products & Services' },
  P3: { name: 'Principle 3', title: 'Employee Wellbeing' },
  P4: { name: 'Principle 4', title: 'Stakeholder Responsiveness' },
  P5: { name: 'Principle 5', title: 'Human Rights' },
  P6: { name: 'Principle 6', title: 'Environment Protection' },
  P7: { name: 'Principle 7', title: 'Policy Advocacy' },
  P8: { name: 'Principle 8', title: 'Inclusive Growth' },
  P9: { name: 'Principle 9', title: 'Consumer Value' },
};

const PRINCIPLE_COLORS = {
  P1: '#3b82f6', P2: '#059669', P3: '#8b5cf6',
  P4: '#f59e0b', P5: '#ef4444', P6: '#14b8a6',
  P7: '#6366f1', P8: '#f97316', P9: '#ec4899',
};

const LEADERSHIP_KEYS = new Set([
  'p1_value_chain_awareness', 'p1_conflict_management_process',
  'env_life_cycle_assessment', 'env_lca_concerns_actions', 'env_recycled_input_material',
  'env_reclaimed_products_packaging', 'p2_reclaimed_products_pct',
  'p3_life_insurance_package', 'p3_value_chain_statutory_dues', 'p3_rehabilitation_injured',
  'transition_assistance_programs', 'p3_value_chain_assessment', 'p3_value_chain_corrective',
  'p4_se_3', 'p4_se_4', 'p4_se_5',
  'p5_business_process_changes', 'p5_hr_due_diligence', 'p5_accessibility_differently_abled',
  'p5_value_chain_hr_assessment', 'p5_value_chain_corrective',
  'p6_water_stress_areas', 'env_assurance_water_stress', 'p6_scope3_emissions', 'env_assurance_ghg_scope3',
  'env_biodiversity_impact', 'env_resource_efficiency_initiatives', 'env_business_continuity_disaster',
  'env_value_chain_impacts', 'env_value_chain_assessment',
  'public_policy_positions',
  'p8_sia_corrective_actions', 'p8_csr_aspirational_districts', 'p8_preferential_procurement',
  'p8_marginalized_groups_procured', 'p8_marginalized_procurement_pct',
  'p8_intellectual_property_traditional', 'p8_ip_corrective_actions', 'p8_csr_beneficiaries',
  'p9_product_info_channels', 'p9_consumer_education', 'p9_service_disruption_mechanism',
  'p9_product_info_beyond_legal', 'p9_consumer_satisfaction_survey',
]);

const ASSURANCE_NOTE_TEXT = 'Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.';
const isAssuranceNote = (config) => config.question_key.startsWith('env_assurance_');
const CONTINUATION_KEYS = new Set([
  'p3_wellbeing_workers', 'p3_wellbeing_spending', 'p3_hazard_identification', 'p3_worker_hazard_reporting', 'p3_non_occupational_healthcare',
  'p5_gross_wages_females', 'top_trade_associations', 'p8_marginalized_groups_procured', 'p8_marginalized_procurement_pct',
  'p9_data_breaches_pii_pct', 'p9_data_breaches_impact', 'p9_consumer_satisfaction_survey',
]);
const isUnnumbered = (config) => isAssuranceNote(config) || CONTINUATION_KEYS.has(config.question_key);

const TRAINING_COLUMN_LABELS = {
  total: 'Total number of training and awareness programmes held',
  trained: 'Topics / principles covered under the training and its impact',
  pct: '%age of persons in respective category covered by the awareness programmes',
};

const WELLBEING_GROUPS = [
  ['Health insurance', 'health_ins', 'B'], ['Accident insurance', 'accident_ins', 'C'],
  ['Maternity benefits', 'maternity', 'D'], ['Paternity Benefits', 'paternity', 'E'],
  ['Day Care facilities', 'daycare', 'F'],
];

const wellbeingOverride = (config, noun) => {
  const section = (key, label) => ({ key, label, section_header: true });
  const child = (key, label) => ({ key, label, child: true });
  return { ...config, table_config: {
    ...config.table_config,
    fixed_rows: [
      section('perm_header', `Permanent ${noun}`), child('perm_male', 'Male'), child('perm_female', 'Female'), child('perm_total', 'Total'),
      section('other_header', `Other than Permanent ${noun}`), child('other_male', 'Male'), child('other_female', 'Female'), child('other_total', 'Total'),
    ],
    column_groups: [
      { label: 'Total (A)', span_rows: true, columns: [{ key: 'total_a', label: 'Total (A)' }] },
      ...WELLBEING_GROUPS.map(([label, k, letter]) => ({
        label, columns: [{ key: `${k}_no`, label: `Number (${letter})` }, { key: `${k}_pct`, label: `% (${letter}/A)` }],
      })),
    ],
  } };
};

const QUESTION_RENAMES = {
  p8_msme_domestic_sourcing: 'Percentage of input material (inputs to total inputs by value) sourced from suppliers:',
  p8_sia_corrective_actions: 'Provide details of actions taken to mitigate any negative social impacts identified in the Social Impact Assessments (Reference: Question 1 of Essential Indicators)',
  p6_water_stress_areas: 'Water withdrawal, consumption and discharge in areas of water stress',
  env_value_chain_impacts: 'Disclose significant adverse environmental impacts arising from the value chain and adaptation or mitigation measures taken.',
  env_waste_management_practices_desc: 'Briefly describe the waste management practices adopted in your establishments. Describe the strategy adopted by your company to reduce usage of hazardous and toxic chemicals in your products and processes and the practices adopted to manage such wastes.',
  p5_remuneration_details: 'Details of Median remuneration / wages',
  p5_gross_wages_females: 'Gross wages paid to females as % of total wages paid by the entity',
  p5_hr_complaints: 'Number of Complaints on the following made by employees and workers:',
  p5_sexual_harassment_complaints: 'Complaints filed under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013',
  p5_hr_corrective_actions: 'Provide details of any corrective actions taken or underway to address significant risks/concerns arising from the assessments at question above',
  p5_value_chain_corrective: 'Provide details of any corrective actions taken or underway to address significant risks/concerns arising from value chain partner assessments at question above',
};

const NO_DETAIL_KEYS = new Set(['p5_hr_focal_point', 'p5_hr_business_agreements', 'p5_accessibility_differently_abled', 'p8_preferential_procurement', 'p9_consumer_satisfaction_survey']);

const wageFyGroup = (label, p, letters) => ({
  label,
  sub_groups: [
    { label: `Total (${letters[0]})`, span_rows: true, columns: [{ key: `${p}_total`, label: '' }] },
    { label: 'Equal to Minimum Wage', columns: [{ key: `${p}_equal_no`, label: `No. (${letters[1]})` }, { key: `${p}_equal_pct`, label: `% (${letters[1]}/${letters[0]})` }] },
    { label: 'More than Minimum Wage', columns: [{ key: `${p}_more_no`, label: `No. (${letters[2]})` }, { key: `${p}_more_pct`, label: `% (${letters[2]}/${letters[0]})` }] },
  ],
});

const minimumWageRows = () => {
  const block = (title, p) => [
    { key: `${p}_header`, label: title, section_header: true },
    { key: `${p}_perm_header`, label: 'Permanent', sub_header: true },
    { key: `${p}_perm_male`, label: 'Male', grandchild: true }, { key: `${p}_perm_female`, label: 'Female', grandchild: true },
    { key: `${p}_other_header`, label: 'Other than Permanent', sub_header: true },
    { key: `${p}_other_male`, label: 'Male', grandchild: true }, { key: `${p}_other_female`, label: 'Female', grandchild: true },
  ];
  return [...block('Employees', 'emp'), ...block('Workers', 'workers')];
};

const withSubHeaders = (config, headers, renames = {}) => {
  const rows = config.table_config.fixed_rows.flatMap((r) => [
    ...(headers[r.key] || []).map((label, i) => ({ key: `${r.key}_sub_header_${i}`, label, sub_header: true })),
    renames[r.key] ? { ...r, label: renames[r.key] } : r,
  ]);
  return { ...config, table_config: { ...config.table_config, fixed_rows: rows } };
};

const stripSource = (config, suffix) => config.table_config.fixed_rows.reduce((acc, r) => (
  r.label.endsWith(suffix) ? { ...acc, [r.key]: r.label.slice(0, -suffix.length) } : acc), {});

const applyConfigOverrides = (rawConfig) => {
  let config = { ...rawConfig, description: '' };
  if (config.question_key === 'env_ecologically_sensitive_areas' && config.table_config?.columns) {
    const showWhenNo = { field: 'conditions_complied', value: 'no' };
    const base = config.table_config.columns.filter(c => c.key !== 'remarks');
    return { ...config, table_config: { ...config.table_config, columns: [
      ...base,
      { key: 'reason', label: 'Reason thereof', type: 'text', width: '200px', show_when: showWhenNo },
      { key: 'corrective_action', label: 'Corrective Action Taken', type: 'text', width: '200px', show_when: showWhenNo },
    ] } };
  }
  if (config.question_key === 'public_policy_positions' && config.table_columns) {
    return { ...config, table_columns: config.table_columns.map(c => (c.key === 'frequency_of_review' ? { ...c, other_key: 'frequency_of_review_other' } : c)) };
  }
  if (config.question_key === 'env_value_chain_assessment' && config.percentage_config) {
    return { ...config, percentage_config: { ...config.percentage_config, description_field: null } };
  }
  if (config.question_key === 'p6_energy_consumption' && config.table_config?.fixed_rows) {
    const renames = { ...stripSource(config, ' - From renewable sources'), ...stripSource(config, ' - From non-renewable sources') };
    return withSubHeaders(config, { renew_electricity: ['From renewable sources'], nonrenew_electricity: ['From non-renewable sources'] }, renames);
  }
  if (config.question_key === 'p6_water_disclosures' && config.table_config?.fixed_rows) {
    return withSubHeaders(config, { surface_water: ['Water withdrawal by source'] });
  }
  if (config.question_key === 'p6_water_discharged' && config.table_config?.fixed_rows) {
    const unit = { default_unit: 'kl' };
    const block = (p, title) => [
      { key: `${p}_sub_header`, label: title, sub_header: true },
      { key: `${p}_no_treatment`, label: 'No treatment', child: true, ...unit },
      { key: `${p}_with_treatment`, label: 'With treatment – please specify level', child: true, ...unit },
    ];
    const rows = [
      { key: 'discharge_sub_header', label: 'Water discharge by destination and level of treatment', sub_header: true },
      ...block('surface', '(i) To Surface water'), ...block('ground', '(ii) To Groundwater'),
      ...block('sea', '(iii) To Seawater'), ...block('third_party', '(iv) Sent to third-parties'),
      ...block('others', '(v) Others'),
      { key: 'total_discharged', label: 'Total water discharged', ...unit },
    ];
    return { ...config, table_config: { ...config.table_config, fixed_rows: rows } };
  }
  if (config.question_key === 'p6_water_stress_areas' && config.table_config?.fixed_rows) {
    const unit = { default_unit: 'kl' };
    const byKey = Object.fromEntries(config.table_config.fixed_rows.map(r => [r.key, r]));
    const pick = (key, label) => ({ ...byKey[key], label: label || byKey[key].label });
    const discharge = (title, no, withT) => [
      { key: `${no}_sub_header`, label: title, sub_header: true },
      pick(no, 'No treatment'), pick(withT, 'With treatment – please specify level'),
    ].map(r => (r.sub_header ? r : { ...r, child: true, ...unit }));
    const rows = [
      { key: 'withdrawal_sub_header', label: 'Water withdrawal by source', sub_header: true },
      pick('surface_water', '(i) Surface water'), pick('groundwater', '(ii) Groundwater'), pick('third_party', '(iii) Third party water'),
      pick('seawater', '(iv) Seawater / desalinated water'), pick('others_withdrawal', '(v) Others'),
      pick('total_withdrawal'), pick('total_consumption'), pick('intensity_turnover'), pick('intensity_optional'),
      { key: 'water_stress_discharge_sub_header', label: 'Water discharge by destination and level of treatment', sub_header: true },
      ...discharge('(i) To Surface water', 'discharge_surface_no', 'discharge_surface_with'),
      ...discharge('(ii) To Groundwater', 'discharge_ground_no', 'discharge_ground_with'),
      ...discharge('(iii) To Seawater', 'discharge_sea_no', 'discharge_sea_with'),
      ...discharge('(iv) Sent to third-parties', 'discharge_third_no', 'discharge_third_with'),
      ...discharge('(v) Others', 'discharge_others_no', 'discharge_others_with'),
      pick('total_discharged', 'Total water discharged'),
    ];
    return { ...config, type: 'water_stress_composite', table_config: { ...config.table_config, fixed_rows: rows } };
  }
  if (config.question_key === 'p6_waste_management_details' && config.table_config?.fixed_rows) {
    const recovered = ['For each category of waste generated, total waste recovered through recycling, re-using or other recovery operations', 'Category of waste'];
    const disposed = ['For each category of waste generated, total waste disposed by nature of disposal method', 'Category of waste'];
    return withSubHeaders(config, { plastic_waste: ['Total Waste generated'], recovered_recycled: recovered, disposed_incineration: disposed }, {
      recovered_recycled: '(i) Recycled', recovered_reused: '(ii) Re-used', recovered_other: '(iii) Other recovery operations', recovered_total: 'Total',
      disposed_incineration: '(i) Incineration', disposed_landfilling: '(ii) Landfilling', disposed_other: '(iii) Other disposal operations', disposed_total: 'Total',
    });
  }
  if (QUESTION_RENAMES[config.question_key]) config = { ...config, question: QUESTION_RENAMES[config.question_key] };
  if (NO_DETAIL_KEYS.has(config.question_key)) return { ...config, conditional_fields: [] };
  if (config.question_key === 'p5_hr_training' && config.table_config) {
    const rows = [
      { key: 'emp_header', label: 'Employees', section_header: true },
      { key: 'emp_permanent', label: 'Permanent', child: true }, { key: 'emp_other', label: 'Other than permanent', child: true }, { key: 'emp_total', label: 'Total Employees', child: true },
      { key: 'workers_header', label: 'Workers', section_header: true },
      { key: 'workers_permanent', label: 'Permanent', child: true }, { key: 'workers_other', label: 'Other than permanent', child: true }, { key: 'workers_total', label: 'Total Workers', child: true },
    ];
    const relabel = (c) => ({ ...c, label: c.label.replace('No. covered', 'No. of employees / workers covered') });
    return { ...config, table_config: { ...config.table_config, fixed_rows: rows,
      columns: config.table_config.columns.map(relabel),
      column_groups: config.table_config.column_groups.map(g => ({ ...g, columns: g.columns.map(relabel) })) } };
  }
  if (config.question_key === 'p5_minimum_wages' && config.table_config) {
    return { ...config, table_config: { ...config.table_config, fixed_rows: minimumWageRows(),
      column_groups: [wageFyGroup('FY _____ (Current Financial Year)', 'cur', ['A', 'B', 'C']), wageFyGroup('FY _____ (Previous Financial Year)', 'prev', ['D', 'E', 'F'])] } };
  }
  if (config.question_key === 'p5_remuneration_details' && config.table_config) {
    const med = 'Median remuneration/salary/wages';
    const colsFor = (g) => [{ key: `${g}_number`, label: 'Number', type: 'number' }, { key: `${g}_median`, label: med, type: 'number' }];
    return { ...config, table_config: { ...config.table_config,
      columns: [...colsFor('male'), ...colsFor('female')],
      column_groups: [{ label: 'Male', columns: colsFor('male') }, { label: 'Female', columns: colsFor('female') }] } };
  }
  if (config.question_key === 'p3_equal_opportunity_policy') {
    return { ...config, conditional_fields: [{ key: 'web_link', label: 'Web Link', type: 'url', show_when: 'yes' }] };
  }
  if (config.question_key === 'p3_parental_leave_return' && config.table_config?.columns) {
    const cols = config.table_config.columns;
    const pick = (prefix) => cols.filter(c => c.key.startsWith(prefix)).map(c => ({ ...c, label: c.key.endsWith('retention') ? 'Retention rate' : 'Return to work rate' }));
    const emp = pick('perm_emp_');
    const wrk = pick('perm_workers_');
    return { ...config, table_config: { ...config.table_config, columns: [...emp, ...wrk],
      column_groups: [{ label: 'Permanent Employees', columns: emp }, { label: 'Permanent Workers', columns: wrk }] } };
  }
  if (config.question_key === 'p3_union_membership' && config.table_config?.fixed_rows) {
    return { ...config, table_config: { ...config.table_config, fixed_rows: [
      { key: 'perm_emp_total', label: 'Total Permanent Employees', section_header: true },
      { key: 'perm_emp_male', label: 'Male', child: true }, { key: 'perm_emp_female', label: 'Female', child: true },
      { key: 'perm_workers_total', label: 'Total Permanent Workers', section_header: true },
      { key: 'perm_workers_male', label: 'Male', child: true }, { key: 'perm_workers_female', label: 'Female', child: true },
    ] } };
  }
  if (config.question_key === 'p3_safety_incidents' && config.table_config?.fixed_rows) {
    const mk = (who, suffix) => [
      { key: `ltifr_${suffix}`, label: 'Lost Time Injury Frequency Rate (LTIFR) (per one million-person hours worked)', child: true },
      { key: `recordable_injuries_${suffix}`, label: 'Total recordable work-related injuries', child: true },
      { key: `fatalities_${suffix}`, label: 'No. of fatalities', child: true },
      { key: `high_consequence_${suffix}`, label: 'High consequence work-related injury or ill-health (excl. fatalities)', child: true },
    ];
    return { ...config, table_config: { ...config.table_config, fixed_rows: [
      { key: 'employees_header', label: 'Employees', section_header: true }, ...mk('Employees', 'employees'),
      { key: 'workers_header', label: 'Workers', section_header: true }, ...mk('Workers', 'workers'),
    ] } };
  }
  if (config.question_key === 'p3_assessments_year' && config.table_config) {
    return { ...config, table_config: { ...config.table_config, columns: [
      { key: 'plants_offices_assessed', label: '% of your plants and offices that were assessed (by entity or statutory authorities or third parties)', type: 'number' },
    ] } };
  }
  if (config.question_key === 'transition_assistance_programs') {
    return { ...config, hide_conditional_text: true };
  }
  if (config.question_key === 'p4_se_4') {
    return { ...config, conditional_fields: [{ key: 'details', label: 'Details', type: 'textarea', show_when: 'yes' }] };
  }
  if (config.question_key === 'p3_ohs_management_system' && config.conditional_fields) {
    return { ...config, conditional_fields: config.conditional_fields.map(f => ({ ...f, show_when: 'yes' })) };
  }
  if (['p3_worker_hazard_reporting', 'p3_non_occupational_healthcare'].includes(config.question_key)) {
    return { ...config, conditional_fields: [] };
  }
  if (['p3_training_details', 'performance_career_reviews'].includes(config.question_key) && config.table_config?.fixed_rows) {
    const rowsCfg = [
      { key: 'emp_header', label: 'Employees', section_header: true },
      { key: 'emp_male', label: 'Male', child: true }, { key: 'emp_female', label: 'Female', child: true }, { key: 'emp_total', label: 'Total', child: true },
      { key: 'workers_header', label: 'Workers', section_header: true },
      { key: 'workers_male', label: 'Male', child: true }, { key: 'workers_female', label: 'Female', child: true }, { key: 'workers_total', label: 'Total', child: true },
    ];
    if (config.question_key === 'performance_career_reviews') {
      return { ...config, table_config: { ...config.table_config, fixed_rows: rowsCfg } };
    }
    const fyGroup = (label, p, letters) => ({
      label,
      sub_groups: [
        { label: `Total (${letters[0]})`, span_rows: true, columns: [{ key: `${p}_total`, label: '' }] },
        { label: 'On Health and safety measures', columns: [{ key: `${p}_hs_no`, label: `No. (${letters[1]})` }, { key: `${p}_hs_pct`, label: `% (${letters[1]}/${letters[0]})` }] },
        { label: 'On Skill upgradation', columns: [{ key: `${p}_skill_no`, label: `No. (${letters[2]})` }, { key: `${p}_skill_pct`, label: `% (${letters[2]}/${letters[0]})` }] },
      ],
    });
    return { ...config, table_config: { ...config.table_config, fixed_rows: rowsCfg,
      column_groups: [fyGroup('FY _____ (Current Financial Year)', 'cur', ['A', 'B', 'C']), fyGroup('FY _____ (Previous Financial Year)', 'prev', ['D', 'E', 'F'])] } };
  }
  if (config.question_key === 'p3_wellbeing_employees' && config.table_config) return wellbeingOverride(config, 'employees');
  if (config.question_key === 'p3_wellbeing_workers' && config.table_config) return wellbeingOverride(config, 'workers');
  if (config.question_key === 'p1_fines_penalties') {
    return { ...config, question: 'Details of fines / penalties /punishment/ award/ compounding fees/ settlement amount paid in proceedings (by the entity or by directors / KMPs) with regulators/ law enforcement agencies/ judicial institutions, in the financial year, in the following format' };
  }
  if (config.question_key === 'p1_training_awareness_coverage' && config.table_config?.columns) {
    return { ...config, table_config: { ...config.table_config, columns: config.table_config.columns.map(c => ({ ...c, label: TRAINING_COLUMN_LABELS[c.key] || c.label })) } };
  }
  if (config.question_key === 'env_sustainable_rd_capex' && config.table_config?.columns) {
    return { ...config, table_config: { ...config.table_config, columns: config.table_config.columns.map(c => c.key === 'details' ? { ...c, label: 'Details of improvements in environmental and social impacts' } : c) } };
  }
  if (config.question_key === 'env_end_of_life_reclamation' && config.table_columns) {
    return { ...config, table_columns: config.table_columns.map(c => c.key === 'product_category' ? { ...c, options: c.options.map(o => o === 'Plastics' ? 'Plastics (including packaging)' : o) } : c) };
  }
  if (config.question_key === 'p1_conflict_of_interest_complaints' && config.table_config) {
    const num = { type: 'number' };
    const txt = { type: 'text' };
    return { ...config, table_config: {
      ...config.table_config,
      columns: [
        { key: 'current_fy', label: 'Number', ...num }, { key: 'current_fy_remarks', label: 'Remarks', ...txt },
        { key: 'previous_fy', label: 'Number', ...num }, { key: 'previous_fy_remarks', label: 'Remarks', ...txt },
      ],
      column_groups: [
        { label: 'Current Financial Year', columns: [{ key: 'current_fy', label: 'Number' }, { key: 'current_fy_remarks', label: 'Remarks' }] },
        { label: 'Previous Financial Year', columns: [{ key: 'previous_fy', label: 'Number' }, { key: 'previous_fy_remarks', label: 'Remarks' }] },
      ],
    } };
  }
  if (['p1_anticorruption_policy', 'p1_conflict_management_process', 'env_sustainable_sourcing', 'cyber_security_policy', 'p9_product_info_beyond_legal'].includes(config.question_key) && config.conditional_fields) {
    return { ...config, conditional_fields: config.conditional_fields.map(f => ({ ...f, show_when: 'yes' })) };
  }
  return config;
};

export default function BRSRSectionC({ framework = 'BRSR', isEditing = false, reportingYear, liveKPIAutofillByQuestion = {}, statusFilter = 'all', questionProgress = {}, approvalEnabled = false, isAdmin = false, onSaved = null }) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allConfigs, setAllConfigs] = useState([]);
  const [allResponses, setAllResponses] = useState({});
  const [approvalStatuses, setApprovalStatuses] = useState({});
  const [timelineQuestionKey, setTimelineQuestionKey] = useState(null);
  const [expanded, setExpanded] = useState({});

  const fetchData = useCallback(async () => {
    if (!reportingYear) return;
    setLoading(true);
    try {
      const headers = getAuthHeader();

      const [configsRes, responsesRes, statusesRes] = await Promise.all([
        axios.get(`${API}/api/esg-questionnaire/configs`, { params: { framework, section: SECTION }, headers })
          .then(r => r.data.configs || []).catch(() => []),
        axios.get(`${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}`, { headers })
          .then(r => r.data.responses || {}).catch(() => ({})),
        axios.get(`${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}/statuses`, { headers })
          .then(r => r.data.statuses || {}).catch(() => ({})),
      ]);

      setAllConfigs(configsRes.filter(c => c.question_key !== 'ltifr_employees_workers'));
      setAllResponses(responsesRes);
      setApprovalStatuses(statusesRes);
    } catch (err) {
      console.error('Failed to fetch Section C data:', err);
    } finally {
      setLoading(false);
    }
  }, [framework, reportingYear, getAuthHeader]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of allConfigs) {
      const p = c.brsr_principle || 'OTHER';
      if (!map[p]) map[p] = [];
      map[p].push(c);
    }
    return map;
  }, [allConfigs]);

  const principleKeys = useMemo(() =>
    ['P1','P2','P3','P4','P5','P6','P7','P8','P9'].filter(p => grouped[p]?.length > 0),
  [grouped]);

  const summary = useMemo(() => {
    const total = allConfigs.length;
    const answered = allConfigs.filter(c => {
      return hasReportableValue(allResponses[c.question_key]);
    }).length;
    return { total, answered, pct: total > 0 ? Math.round((answered / total) * 100) : 0 };
  }, [allConfigs, allResponses]);

  const handleResponseChange = (questionKey, value) => {
    setAllResponses(prev => ({ ...prev, [questionKey]: value }));
  };

  const togglePrinciple = (p) => {
    setExpanded(prev => ({ ...prev, [p]: !prev[p] }));
  };

  const expandAll = () => {
    const all = {};
    principleKeys.forEach(p => { all[p] = true; });
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  // Save individual question
  const { promptAfterSave } = useLinkedFrameworks();
  const saveQuestion = async (questionKey, value, status = 'saved') => {
    try {
      const headers = getAuthHeader();
      await axios.post(
        `${API}/api/esg-questionnaire/response`,
        {
          question_key: questionKey,
          value,
          status,
          reporting_period: reportingYear,
        },
        { headers }
      );
      toast.success(status === 'draft' ? 'Saved as draft' : 'Response saved');
      if (onSaved) onSaved();
      if (status === 'saved') promptAfterSave([questionKey]);
      
      // Refresh status for this question
      try {
        const statusRes = await axios.get(
          `${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}/statuses`,
          { headers }
        );
        setApprovalStatuses(statusRes.data.statuses || {});
      } catch (e) {
        // Ignore status fetch errors
      }
    } catch (error) {
      console.error('Save question error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save');
      throw error;
    }
  };

  // Get status badge for a principle
  const getPrincipleStatus = (principle) => {
    const questions = grouped[principle] || [];
    const statuses = questions.map(q => approvalStatuses[q.question_key]?.approval_status).filter(Boolean);
    
    if (statuses.length === 0) return null;
    
    const hasPending = statuses.includes('pending_approval');
    const hasRejected = statuses.includes('rejected');
    const allApproved = statuses.every(s => s === 'approved');
    
    if (allApproved) return { label: 'Approved', className: 'bg-green-100 text-green-800' };
    if (hasRejected) return { label: 'Has Rejections', className: 'bg-red-100 text-red-800' };
    if (hasPending) return { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-800' };
    return null;
  };

  const renderQuestion = (config) => (
                    <QuestionRenderer
                      key={config.question_key}
                      config={config}
                      value={mergeBRSRAutofill(allResponses[config.question_key], liveKPIAutofillByQuestion[config.question_key]?.value)}
                      onChange={(val) => handleResponseChange(config.question_key, val)}
                      isEditing={isEditing}
                      allResponses={{
                        ...allResponses,
                        reporting_year: reportingYear,
                        framework,
                      }}
                      historicalData={null}
                      approvalStatus={approvalStatuses[config.question_key]}
                      onSaveQuestion={saveQuestion}
                      perQuestionEdit
                      approvalEnabled={approvalEnabled}
                      isAdmin={isAdmin}
                      onCancelEdit={fetchData}
                      onOpenTimeline={() => setTimelineQuestionKey(config.question_key)}
                      lockedAnswerPaths={liveKPIAutofillByQuestion[config.question_key]?.locked_paths || []}
                      dynamicAutofillRows={liveKPIAutofillByQuestion[config.question_key]?.dynamic_rows || []}
                    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-text-muted">Loading Section C...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Principle Sections */}
      {principleKeys.map(p => {
        const meta = PRINCIPLE_META[p] || { name: p, title: '' };
        const allQuestions = grouped[p] || [];
        const questions = statusFilter === 'all'
          ? allQuestions
          : allQuestions.filter(c => questionProgress[c.question_key] === statusFilter);
        if (statusFilter !== 'all' && questions.length === 0) return null;
        const isOpen = statusFilter !== 'all' || !!expanded[p];
        const answeredInP = allQuestions.filter(c => {
          return hasReportableValue(allResponses[c.question_key]);
        }).length;
        const color = PRINCIPLE_COLORS[p] || '#78716c';
        const principleStatus = getPrincipleStatus(p);

        return (
          <div key={p} id={`brsr-group-${p}`} className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden scroll-mt-24 mb-6" data-testid={`principle-${p}`}>
            <button
              onClick={() => togglePrinciple(p)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50/50 transition-colors"
              data-testid={`principle-${p}-toggle`}
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">{meta.name}: {meta.title}</h3>
                    {principleStatus && (
                      <Badge className={`text-xs ${principleStatus.className}`}>
                        {principleStatus.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">{allQuestions.length} questions · {answeredInP} answered</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${allQuestions.length > 0 ? (answeredInP / allQuestions.length) * 100 : 0}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs tabular-nums text-stone-500 w-8 text-right">
                  {allQuestions.length > 0 ? Math.round((answeredInP / allQuestions.length) * 100) : 0}%
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t">
                {[['Essential Indicators', questions.filter(c => !LEADERSHIP_KEYS.has(c.question_key))],
                  ['Leadership Indicators', questions.filter(c => LEADERSHIP_KEYS.has(c.question_key))]].map(([title, list]) => list.length > 0 && (
                  <div key={title} className="px-5 py-4" data-testid={`principle-${p}-${title.split(' ')[0].toLowerCase()}-indicators`}>
                    <h4 className="text-base font-bold text-stone-900 text-center bg-stone-100 rounded-md py-2 mb-4" data-testid={`principle-${p}-${title.split(" ")[0].toLowerCase()}-heading`}>{title}</h4>
                    <div className="space-y-1">
                      {list.map((c) => {
                        const cfg = applyConfigOverrides(c);
                        if (isAssuranceNote(c)) return renderQuestion({ ...cfg, question: ASSURANCE_NOTE_TEXT });
                        if (isUnnumbered(c)) return renderQuestion(cfg);
                        const full = allQuestions.filter(q => LEADERSHIP_KEYS.has(q.question_key) === (title === 'Leadership Indicators'));
                        const number = full.slice(0, full.findIndex(q => q.question_key === c.question_key) + 1).filter(q => !isUnnumbered(q)).length;
                        return renderQuestion({ ...cfg, question: `${number}. ${cfg.question}` });
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <QuestionVersionHistory
        open={Boolean(timelineQuestionKey)}
        onOpenChange={(open) => !open && setTimelineQuestionKey(null)}
        framework={framework}
        questionKey={timelineQuestionKey}
        reportingYear={reportingYear}
      />
    </div>
  );
}
