/**
 * TotalTargetForm — single row form for org-wide reduction targets.
 */
import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import TargetTypeSelector from './TargetTypeSelector';

export default function TotalTargetForm({ value, yearOptions, onFieldChange, disabled }) {
  return (
    <div className="space-y-3" data-testid="total-target-form">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-text-muted">Target Year</Label>
          <select
            value={value.target_year || ''}
            onChange={(e) => onFieldChange('target_year', e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-2 text-sm border border-stone-300 rounded-md bg-white disabled:bg-stone-100"
            data-testid="total-target-year"
          >
            <option value="">Select year…</option>
            {yearOptions.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-text-muted">Target Type</Label>
          <div>
            <TargetTypeSelector
              value={value.target_type}
              onChange={(t) => onFieldChange('target_type', t)}
              disabled={disabled}
              ariaLabel="Total target type"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-text-muted">Value</Label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder={value.target_type === 'absolute' ? 'tCO₂e' : '%'}
            value={value.value ?? ''}
            onChange={(e) => onFieldChange('value', e.target.value)}
            disabled={disabled}
            data-testid="total-target-value"
          />
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Reduction relative to base year. Example: <span className="font-medium">100 tCO₂e</span> or
        <span className="font-medium"> 20%</span>.
      </p>
    </div>
  );
}
