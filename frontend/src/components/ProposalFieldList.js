/**
 * Read-only field list laid out like the Add / Edit Metric form:
 * group headings, level indentation, configured labels and units.
 */
import React from 'react';

const isEntered = (v) => v !== undefined && v !== null && v !== '';
const isRowFilled = (row) => Object.values(row || {}).some(isEntered);

export const formatFieldDisplay = (field, values) => {
  const value = values?.[field.field_key];
  if (!isEntered(value)) return '-';
  if (Array.isArray(value)) return value.join(', ');
  const unit = values?.[`${field.field_key}_unit`] || (field.has_unit ? field.default_unit : '');
  return `${value}${unit ? ` ${unit}` : ''}`;
};

function TableValue({ field, rows }) {
  const columns = field.table_columns || [];
  const filled = (rows || []).filter(isRowFilled);
  if (!filled.length) return <p className="text-sm text-stone-400">-</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 text-stone-500">
          <tr>{columns.map((c) => <th key={c.key} className="px-2 py-1 text-left font-medium">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {filled.map((row, i) => (
            <tr key={i} className="border-t border-stone-100">
              {columns.map((c) => <td key={c.key} className="px-2 py-1 text-stone-900">{isEntered(row[c.key]) ? String(row[c.key]) : '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProposalFieldList({ fields, values, approvedValues, testId }) {
  let lastGroup = null;
  const rows = [];
  fields.forEach((field) => {
    const key = field.field_key;
    const tableHasRows = field.hide_if_table_has_rows && (values?.[field.hide_if_table_has_rows] || []).some(isRowFilled);
    if ((field.legacy_only && !isEntered(values?.[key])) || tableHasRows) return;
    if (field.group && field.group !== lastGroup) {
      lastGroup = field.group;
      rows.push(
        <p key={`group-${key}`} className="pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500" data-testid={`${testId}-group-${key}`}>{field.group}</p>
      );
    }
    if (field.type === 'table') {
      rows.push(
        <div key={key} className="py-2" data-testid={`${testId}-row-${key}`}>
          <p className="mb-1 text-sm text-stone-700">{field.label}</p>
          <TableValue field={field} rows={values?.[key]} />
        </div>
      );
      return;
    }
    const shown = formatFieldDisplay(field, values);
    const before = approvedValues ? formatFieldDisplay(field, approvedValues) : null;
    const changed = before !== null && before !== shown;
    rows.push(
      <div key={key} className="flex items-center justify-between gap-4 border-b border-stone-100 py-1.5"
           style={{ paddingLeft: (field.level || 0) * 20 }} data-testid={`${testId}-row-${key}`}>
        <span className="text-sm leading-4 text-stone-700">{field.label}</span>
        <span className={`text-right text-sm font-medium ${changed ? 'text-blue-700' : shown === '-' ? 'text-stone-400' : 'text-stone-900'}`}>
          {shown}
          {changed && <span className="ml-2 text-xs font-normal text-stone-400">(was: {before})</span>}
        </span>
      </div>
    );
  });
  return <div className="space-y-0.5" data-testid={testId}>{rows}</div>;
}
