/**
 * TargetRow — reusable row for a single configurable target line.
 *
 * Shared by Scope-wise and Category-wise forms. Supports clearing via the
 * "Clear" button or by emptying both year + value fields.
 */
import React from 'react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { X } from 'lucide-react';
import TargetTypeSelector from './TargetTypeSelector';

export default function TargetRow({
  label,
  entry,
  yearOptions = [],
  onChange,
  onClear,
  testIdPrefix,
  disabled = false,
}) {
  const value = entry || {};
  const isConfigured = !!(value.target_year || (value.value !== '' && value.value != null));

  return (
    <div
      className={`grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-md border ${
        isConfigured ? 'border-emerald-200 bg-emerald-50/30' : 'border-stone-200 bg-white'
      }`}
      data-testid={`${testIdPrefix}-row`}
    >
      <div className="col-span-3 text-sm font-medium text-text-primary truncate" title={label}>
        {label}
      </div>

      <div className="col-span-3">
        <select
          value={value.target_year || ''}
          onChange={(e) => onChange?.('target_year', e.target.value)}
          disabled={disabled}
          className="w-full px-2 py-1.5 text-sm border border-stone-300 rounded-md bg-white disabled:bg-stone-100"
          data-testid={`${testIdPrefix}-year`}
        >
          <option value="">— NA —</option>
          {yearOptions.map((y) => (
            <option key={y.value} value={y.value}>{y.label}</option>
          ))}
        </select>
      </div>

      <div className="col-span-3">
        <TargetTypeSelector
          value={value.target_type || 'percentage'}
          onChange={(t) => onChange?.('target_type', t)}
          disabled={disabled}
          ariaLabel={`${label} target type`}
        />
      </div>

      <div className="col-span-2">
        <Input
          type="number"
          step="any"
          min="0"
          placeholder="—"
          value={value.value ?? ''}
          onChange={(e) => onChange?.('value', e.target.value)}
          disabled={disabled}
          className="h-9"
          data-testid={`${testIdPrefix}-value`}
        />
      </div>

      <div className="col-span-1 flex justify-end">
        {isConfigured && !disabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 w-7 p-0 text-stone-400 hover:text-red-600"
            title="Clear (set NA)"
            data-testid={`${testIdPrefix}-clear`}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
