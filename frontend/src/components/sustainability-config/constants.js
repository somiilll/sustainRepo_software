export const RESPONSE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'currency', label: 'Currency' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
  { value: 'facility', label: 'Facility' },
  { value: 'file', label: 'File/Evidence' },
];

export const MODULE_MODES = [
  { value: 'default', label: 'Default Modules', desc: 'Use only global/standard modules' },
  { value: 'default_custom', label: 'Default + Custom', desc: 'Global modules plus org-specific additions' },
  { value: 'custom', label: 'Custom Only', desc: 'Entirely org-specific module structure' },
];

export function toCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed';
}

/** Map global field.type back to response_type for editing */
export function mapTypeBack(type) {
  const m = {
    text: 'text', number: 'number', dropdown: 'dropdown', yes_no: 'yes_no',
    date: 'date', file_upload: 'file', textarea: 'text', radio: 'dropdown',
    checkbox_group: 'multi_select',
  };
  return m[type] || type || 'text';
}
