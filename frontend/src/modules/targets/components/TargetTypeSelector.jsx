/**
 * TargetTypeSelector — dropdown for picking absolute vs percentage.
 */
import React from 'react';
import { TARGET_TYPES } from '../constants';

export default function TargetTypeSelector({ value, onChange, disabled, ariaLabel = 'Target type' }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value || 'percentage'}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className="px-2 py-1.5 text-sm border border-stone-300 rounded-md bg-white disabled:bg-stone-100"
      data-testid="target-type-selector"
    >
      {TARGET_TYPES.map((t) => (
        <option key={t.value} value={t.value}>{t.label}</option>
      ))}
    </select>
  );
}
