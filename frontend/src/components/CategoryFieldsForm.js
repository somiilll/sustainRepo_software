/**
 * Category fields exactly as shown in Add / Edit Metric: workforce grid (+ extras) or the grouped tree form.
 * `onChange` always receives an updater: (prevValues) => nextValues.
 */
import React from 'react';
import WorkforceDataTable from './WorkforceDataTable';
import { HierarchicalFields, hasFieldTree } from './HierarchicalFields';
import { DynamicFieldRenderer } from './ESGRecords';
import {
  EMPLOYEE_DIVERSITY_CONFIG,
  WORKER_DIVERSITY_CONFIG,
  BOD_DIVERSITY_CONFIG,
  KMP_DIVERSITY_CONFIG,
  EMPLOYEE_TURNOVER_CONFIG,
  WORKER_TURNOVER_CONFIG,
  EMPLOYEE_PARENTAL_LEAVE_CONFIG,
  WORKER_PARENTAL_LEAVE_CONFIG,
  GENERAL_TRAINING_CONFIG,
  CONSUMER_COMPLAINTS_CONFIG,
  INTERNAL_COMPLAINTS_CONFIG,
} from '../config/workforceTableConfigs';
import { WORKFORCE_GRID_CONFIGS } from '../config/workforceSpec.generated';

const LEGACY_WORKFORCE_TABLE_MAP = {
  'Employee Diversity': EMPLOYEE_DIVERSITY_CONFIG,
  'Workers Diversity': WORKER_DIVERSITY_CONFIG,
  'Board of Directors Diversity': BOD_DIVERSITY_CONFIG,
  'Key Management Personnel Diversity': KMP_DIVERSITY_CONFIG,
  'Employee Turnover': EMPLOYEE_TURNOVER_CONFIG,
  'Workers Turnover': WORKER_TURNOVER_CONFIG,
  'Employees Parental Leave': EMPLOYEE_PARENTAL_LEAVE_CONFIG,
  'Workers Parental Leave': WORKER_PARENTAL_LEAVE_CONFIG,
  'General Training': GENERAL_TRAINING_CONFIG,
  'Consumer Complaints': CONSUMER_COMPLAINTS_CONFIG,
  'Internal Complaints': INTERNAL_COMPLAINTS_CONFIG,
};
export const WORKFORCE_TABLE_MAP = { ...LEGACY_WORKFORCE_TABLE_MAP, ...WORKFORCE_GRID_CONFIGS };

export const workforceSupplementaryFields = (fields = []) => {
  const hasGridFields = fields.some((field) => field.grid_row);
  return fields.filter((field) => !field.grid_row && (hasGridFields || field.show_with_legacy_ui));
};

export const hasCategoryForm = (subcategory, fields) => !!WORKFORCE_TABLE_MAP[subcategory] || (fields || []).length > 0;

const READ_ONLY_CLASS = '[&_input]:pointer-events-none [&_[role=combobox]]:pointer-events-none';

export default function CategoryFieldsForm({ subcategory, fields, values, onChange, readOnly = false, testIdPrefix }) {
  const config = WORKFORCE_TABLE_MAP[subcategory];
  if (config) {
    const extras = workforceSupplementaryFields(fields);
    return (
      <div className={`space-y-4 ${readOnly ? READ_ONLY_CLASS : ''}`}>
        <WorkforceDataTable config={config} fieldValues={values} onChange={(fv) => onChange(() => fv)} isEditing />
        {extras.length > 0 && (
          <HierarchicalFields fields={extras} values={values || {}} onChange={onChange} readOnly={readOnly} testIdPrefix={`${testIdPrefix}-extra`} />
        )}
      </div>
    );
  }
  if (hasFieldTree(fields)) {
    return <HierarchicalFields fields={fields} values={values || {}} onChange={onChange} readOnly={readOnly} testIdPrefix={testIdPrefix} />;
  }
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${readOnly ? READ_ONLY_CLASS : ''}`}>
      {(fields || []).map((field) => (
        <DynamicFieldRenderer
          key={field.field_key}
          field={field}
          value={values?.[field.field_key]}
          onChange={(val) => onChange((prev) => ({ ...prev, [field.field_key]: val }))}
          unitValue={values?.[`${field.field_key}_unit`]}
          onUnitChange={(unit) => onChange((prev) => ({ ...prev, [`${field.field_key}_unit`]: unit }))}
          testIdPrefix={testIdPrefix}
        />
      ))}
    </div>
  );
}
