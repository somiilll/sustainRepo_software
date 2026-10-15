/**
 * Tree-style entry form for category fields that carry group / level / parent_key / sum_parents.
 * Parent totals fill live from their parts until the user types a total directly.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export const hasFieldTree = (fields) => (fields || []).some((f) => f.group || f.parent_key);

const isEntered = (v) => v !== undefined && v !== null && v !== '';

export function HierarchicalFields({ fields, values, onChange, testIdPrefix = 'metric-field' }) {
  const [collapsed, setCollapsed] = useState({});
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

  const propagate = (vals, key) => {
    (byKey[key]?.sum_parents || []).forEach((parent) => {
      if (manual.current.has(parent)) return;
      const entered = (sumChildren[parent] || []).filter((c) => isEntered(vals[c]));
      if (entered.length === 0) {
        if (auto.current.has(parent)) {
          delete vals[parent];
          auto.current.delete(parent);
          propagate(vals, parent);
        }
        return;
      }
      const units = new Set(entered.map((c) => unitOf(vals, c)));
      if (units.size > 1) return;
      vals[parent] = Math.round(entered.reduce((s, c) => s + Number(vals[c] || 0), 0) * 1e6) / 1e6;
      if (byKey[parent]?.has_unit) vals[`${parent}_unit`] = [...units][0];
      auto.current.add(parent);
      propagate(vals, parent);
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
      return next;
    });
  };

  const handleUnit = (key, unit) => {
    onChange((prev) => {
      const next = { ...prev, [`${key}_unit`]: unit };
      propagate(next, key);
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
    if (!isVisible(field)) return;
    const key = field.field_key;
    const kids = children[key] || [];
    const isAuto = !manual.current.has(key) && (sumChildren[key] || []).some((c) => isEntered(values?.[c]));
    if (field.group && field.group !== lastGroup) {
      lastGroup = field.group;
      rows.push(
        <p key={`group-${key}`} className="pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500"
           data-testid={`${testIdPrefix}-group-${key}`}>
          {field.group}
        </p>
      );
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
            {field.brsr_reference && (
              <span className="px-1.5 rounded text-[10px] bg-orange-50 text-orange-700 border border-orange-200">
                BRSR: {field.brsr_reference}
              </span>
            )}
            {field.gri_disclosure && (
              <span className="px-1.5 rounded text-[10px] bg-sky-50 text-sky-700 border border-sky-200">
                GRI: {field.gri_disclosure}
              </span>
            )}
            {isAuto && (
              <span className="px-1.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                Auto
              </span>
            )}
          </div>
        </div>
        <Input
          type="number"
          value={values?.[key] ?? ''}
          onChange={(e) => handleValue(key, e.target.value)}
          min={field.validation?.min}
          step={field.validation?.step}
          className="w-40 border-stone-300"
          data-testid={`${testIdPrefix}-${key}-input`}
        />
        {field.has_unit && field.allowed_units?.length > 0 && (
          <Select value={values?.[`${key}_unit`] || field.default_unit || ''} onValueChange={(u) => handleUnit(key, u)}>
            <SelectTrigger className="w-[120px] shrink-0 border-stone-300" data-testid={`${testIdPrefix}-${key}-unit-select`}>
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
