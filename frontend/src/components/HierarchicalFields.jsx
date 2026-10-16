/**
 * Tree-style entry form for category fields that carry group / level / parent_key / sum_parents.
 * Parent totals fill live from their parts until the user types a total directly.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export const hasFieldTree = (fields) => (fields || []).some((f) => f.group || f.parent_key);

const isEntered = (v) => v !== undefined && v !== null && v !== '';
const FALLBACK_UNIT_FACTORS = {
  litres: 1, kilolitres: 1000, megalitres: 1000000,
  j: 1, kj: 1e3, mj: 1e6, gj: 1e9, tj: 1e12, kwh: 3.6e6, mwh: 3.6e9, gwh: 3.6e12,
};
const isRowFilled = (row) => Object.values(row || {}).some(isEntered);

const derivedValue = (row, { num, den }) => {
  const d = Number(row?.[den]);
  return isEntered(row?.[num]) && d ? Math.round((Number(row[num]) / d) * 1e6) / 1e6 : '-';
};

function RepeatableTable({ field, rows, onChange, testIdPrefix }) {
  const columns = field.table_columns || [];
  const setCell = (index, key, value) => onChange(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  const emptyRow = () => Object.fromEntries(
    columns.filter((c) => c.key.endsWith('_unit')).map((c) => [c.key, c.options?.[0]])
  );
  return (
    <div className="space-y-2 w-full" data-testid={`${testIdPrefix}-${field.field_key}-table`}>
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 text-left font-medium text-xs whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-2 py-3 text-xs text-stone-500 italic">
                No rows added yet. Use "Add row" to add one.
              </td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-t" data-testid={`${testIdPrefix}-${field.field_key}-row-${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 min-w-[130px]">
                    {c.derived ? (
                      <span className="text-sm text-stone-700 px-2"
                            data-testid={`${testIdPrefix}-${field.field_key}-${c.key}-${i}`}>
                        {derivedValue(row, c.derived)}
                      </span>
                    ) : c.type === 'dropdown' ? (
                      <Select value={row[c.key] || ''} onValueChange={(v) => setCell(i, c.key, v)}>
                        <SelectTrigger className="h-9 rounded-[10px] border-stone-300"
                                       data-testid={`${testIdPrefix}-${field.field_key}-${c.key}-${i}`}>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {(c.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={c.type === 'number' ? 'number' : 'text'}
                        min={c.type === 'number' ? 0 : undefined}
                        value={row[c.key] ?? ''}
                        onChange={(e) => setCell(i, c.key,
                          c.type === 'number' && e.target.value !== '' ? parseFloat(e.target.value) : e.target.value)}
                        className="h-9 rounded-[10px] border-stone-300"
                        data-testid={`${testIdPrefix}-${field.field_key}-${c.key}-${i}`}
                      />
                    )}
                  </td>
                ))}
                <td className="px-1">
                  <Button type="button" variant="ghost" size="icon"
                          onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                          data-testid={`${testIdPrefix}-${field.field_key}-remove-${i}`}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyRow()])}
              disabled={field.table_max_rows ? rows.length >= field.table_max_rows : false}
              data-testid={`${testIdPrefix}-${field.field_key}-add-row`}>
        <Plus className="w-4 h-4 mr-1" /> Add row
      </Button>
    </div>
  );
}

export function HierarchicalFields({ fields, values, onChange, testIdPrefix = 'metric-field' }) {
  const [collapsed, setCollapsed] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const manual = useRef(new Set());
  const auto = useRef(new Set());

  const { byKey, children, sumChildren } = useMemo(() => {
    const byKey = {};
    const children = {};
    const sumChildren = {};
    fields.forEach((f) => {
      byKey[f.field_key] = f;
      if (f.parent_key) (children[f.parent_key] ||= []).push(f.field_key);
      (f.sum_parents || []).forEach((p) => (sumChildren[p] ||= []).push(f.field_key));
    });
    return { byKey, children, sumChildren };
  }, [fields]);

  const unitOf = (vals, key) => vals[`${key}_unit`] || byKey[key]?.default_unit || '';
  const unitFactor = (field, unit) => field?.unit_conversion?.factors?.[String(unit).toLowerCase()]
    ?? FALLBACK_UNIT_FACTORS[String(unit).toLowerCase()];

  const updateAutoTotal = (vals, parent) => {
    if (manual.current.has(parent)) return;
    const entered = (sumChildren[parent] || []).filter((child) => isEntered(vals[child]));
    if (entered.length === 0) {
      if (auto.current.has(parent)) {
        delete vals[parent];
        auto.current.delete(parent);
      }
      return;
    }
    const targetUnit = unitOf(vals, parent) || unitOf(vals, entered[0]);
    const targetFactor = unitFactor(byKey[parent], targetUnit);
    const converted = entered.map((child) => {
      const sourceFactor = unitFactor(byKey[child], unitOf(vals, child));
      return sourceFactor && targetFactor ? Number(vals[child] || 0) * sourceFactor / targetFactor : null;
    });
    if (converted.some((value) => value === null)) {
      const units = new Set(entered.map((child) => unitOf(vals, child)));
      if (units.size > 1) return;
      vals[parent] = Math.round(entered.reduce((sum, child) => sum + Number(vals[child] || 0), 0) * 1e6) / 1e6;
    } else {
      vals[parent] = Math.round(converted.reduce((sum, value) => sum + value, 0) * 1e6) / 1e6;
    }
    if (byKey[parent]?.has_unit) vals[`${parent}_unit`] = targetUnit;
    auto.current.add(parent);
  };

  const propagate = (vals, key) => {
    (byKey[key]?.sum_parents || []).forEach((parent) => {
      updateAutoTotal(vals, parent);
      propagate(vals, parent);
    });
  };

  const deriveSummaries = (vals) => {
    fields.filter((f) => f.table_summary).forEach((f) => {
      const { source, op, column, unit_column: unitColumn, optional } = f.table_summary;
      const rows = (vals[source] || []).filter(isRowFilled);
      if (optional) {
        if (rows.length === 0) {
          if (auto.current.has(f.field_key)) {
            delete vals[f.field_key];
            auto.current.delete(f.field_key);
          }
          return;
        }
        auto.current.add(f.field_key);
      }
      if (op === 'count') {
        vals[f.field_key] = rows.length;
        return;
      }
      if (op === 'ratio') {
        const sumOf = (col) => rows.reduce((t, r) => t + (Number(r[col]) || 0), 0);
        const den = sumOf(f.table_summary.den_column);
        vals[f.field_key] = den ? Math.round((sumOf(f.table_summary.num_column) / den) * 1e6) / 1e6 : 0;
        return;
      }
      const target = VOLUME_FACTORS[String(unitOf(vals, f.field_key)).toLowerCase()] || 1;
      const numbers = rows.filter((r) => isEntered(r[column])).map((r) => Number(r[column]) * (unitColumn
        ? (VOLUME_FACTORS[String(r[unitColumn] || unitOf(vals, f.field_key)).toLowerCase()] || 1) / target : 1));
      const total = numbers.reduce((sum, n) => sum + n, 0);
      const result = op === 'avg' ? (numbers.length ? total / numbers.length : 0) : total;
      vals[f.field_key] = Math.round(result * 1e6) / 1e6;
    });
  };

  const deriveRatios = (vals) => {
    fields.filter((f) => f.ratio).forEach(({ field_key: key, ratio: { num, den, scale } }) => {
      if (isEntered(vals[num]) && Number(vals[den])) {
        vals[key] = Math.round((Number(vals[num]) * scale / Number(vals[den])) * 1e6) / 1e6;
      } else {
        delete vals[key];
      }
    });
  };

  const handleChoice = (key, value) => onChange((prev) => ({ ...prev, [key]: value }));

  const handleMulti = (key, option, checked) => onChange((prev) => {
    const current = prev[key] || [];
    return { ...prev, [key]: checked ? [...current, option] : current.filter((o) => o !== option) };
  });

  const summaryLocked = (f) => !!f.table_summary
    && (!f.table_summary.optional || (values?.[f.table_summary.source] || []).some(isRowFilled));

  const handleTable = (key, rows) => {
    onChange((prev) => {
      const next = { ...prev, [key]: rows };
      deriveSummaries(next);
      fields.filter((f) => f.table_summary?.optional).forEach((f) => propagate(next, f.field_key));
      return next;
    });
  };

  const handleValue = (key, raw) => {
    const num = raw === '' ? undefined : parseFloat(raw);
    const cleared = num === undefined || Number.isNaN(num);
    if (sumChildren[key]) {
      if (cleared) manual.current.delete(key);
      else manual.current.add(key);
    }
    auto.current.delete(key);
    onChange((prev) => {
      const next = { ...prev };
      if (cleared) delete next[key];
      else next[key] = num;
      propagate(next, key);
      deriveRatios(next);
      return next;
    });
  };

  const handleUnit = (key, unit) => {
    onChange((prev) => {
      const next = { ...prev, [`${key}_unit`]: unit };
      updateAutoTotal(next, key);
      propagate(next, key);
      deriveSummaries(next);
      return next;
    });
  };

  const hasDescendantValue = (key) =>
    (children[key] || []).some((c) => isEntered(values?.[c]) || hasDescendantValue(c));

  const isOpen = (key) => (collapsed[key] === undefined ? hasDescendantValue(key) : !collapsed[key]);

  const isVisible = (field) => {
    let parent = field.parent_key;
    while (parent) {
      if (!isOpen(parent)) return false;
      parent = byKey[parent]?.parent_key;
    }
    return true;
  };

  let lastGroup = null;
  const rows = [];
  fields.forEach((field) => {
    const tableHasRows = field.hide_if_table_has_rows
      && (values?.[field.hide_if_table_has_rows] || []).some(isRowFilled);
    if ((field.legacy_only && !isEntered(values?.[field.field_key])) || tableHasRows) return;
    if (!isVisible(field)) return;
    const groupCollapsed = field.group && collapsedGroups[field.group];
    const key = field.field_key;
    const kids = children[key] || [];
    const isAuto = !manual.current.has(key) && (sumChildren[key] || []).some((c) => isEntered(values?.[c]));
    const isChoice = ['dropdown', 'radio'].includes(field.type);
    const isMulti = field.type === 'checkbox_group';
    const isText = ['text', 'textarea'].includes(field.type);
    if (field.group && field.group !== lastGroup) {
      lastGroup = field.group;
      rows.push(
        <button type="button" key={`group-${key}`} className="flex w-full items-center gap-1 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 hover:text-stone-800"
                onClick={() => setCollapsedGroups((groups) => ({ ...groups, [field.group]: !groups[field.group] }))}
                data-testid={`${testIdPrefix}-group-${key}-toggle`}>
          {groupCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {field.group}
        </button>
      );
    }
    if (groupCollapsed) return;
    if (field.type === 'table') {
      rows.push(
        <div key={key} className="py-2" data-testid={`${testIdPrefix}-row-${key}`}>
          <RepeatableTable field={field} rows={values?.[key] || []}
                           onChange={(r) => handleTable(key, r)} testIdPrefix={testIdPrefix} />
        </div>
      );
      return;
    }
    rows.push(
      <div key={key} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-stone-100"
           style={{ paddingLeft: (field.level || 0) * 20 }} data-testid={`${testIdPrefix}-row-${key}`}>
        <div className="w-5 shrink-0">
          {kids.length > 0 && (
            <button type="button" className="text-stone-500 hover:text-stone-800"
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: isOpen(key) }))}
                    data-testid={`${testIdPrefix}-${key}-toggle`}>
              {isOpen(key) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-[180px]">
          <Label className="text-sm leading-4">{field.label}</Label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(isAuto || summaryLocked(field) || field.ratio) && (
              <span className="px-1.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                Auto
              </span>
            )}
          </div>
        </div>
        {isMulti ? (
          <div className="flex flex-wrap gap-3" data-testid={`${testIdPrefix}-${key}-multi`}>
            {(field.options || []).map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={(values?.[key] || []).includes(o)}
                       onChange={(e) => handleMulti(key, o, e.target.checked)}
                       data-testid={`${testIdPrefix}-${key}-option-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
                {o}
              </label>
            ))}
          </div>
        ) : isText ? (
          <Input type="text" value={values?.[key] ?? ''} onChange={(e) => handleChoice(key, e.target.value)}
            className="w-72 max-w-full rounded-[10px] border-stone-300" data-testid={`${testIdPrefix}-${key}-input`} />
        ) : isChoice ? (
          <Select value={values?.[key] || ''} onValueChange={(v) => handleChoice(key, v)}>
            <SelectTrigger className="w-72 max-w-full rounded-[10px] border-stone-300" data-testid={`${testIdPrefix}-${key}-select`}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type="number"
            value={values?.[key] ?? ''}
            disabled={summaryLocked(field) || !!field.ratio}
            onChange={(e) => handleValue(key, e.target.value)}
            min={field.validation?.min}
            step={field.validation?.step}
            className="w-40 rounded-[10px] border-stone-300"
            data-testid={`${testIdPrefix}-${key}-input`}
          />
        )}
        {field.has_unit && field.allowed_units?.length > 0 && (
          <Select value={values?.[`${key}_unit`] || field.default_unit || ''} onValueChange={(u) => handleUnit(key, u)}>
            <SelectTrigger className="w-[120px] shrink-0 rounded-[10px] border-stone-300" data-testid={`${testIdPrefix}-${key}-unit-select`}>
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              {field.allowed_units.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  });

  return <div className="space-y-0.5" data-testid={`${testIdPrefix}-tree`}>{rows}</div>;
}
