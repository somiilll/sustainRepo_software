export const escapeNativeOptionHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const buildNativeOptionsHtml = (options, {
  placeholder = null,
  getValue = (option) => option,
  getLabel = (option) => option,
} = {}) => {
  const placeholderHtml = placeholder === null
    ? ''
    : `<option value="">${escapeNativeOptionHtml(placeholder)}</option>`;
  const optionHtml = options.map((option) => (
    `<option value="${escapeNativeOptionHtml(getValue(option))}">${escapeNativeOptionHtml(getLabel(option))}</option>`
  )).join('');
  return `${placeholderHtml}${optionHtml}`;
};