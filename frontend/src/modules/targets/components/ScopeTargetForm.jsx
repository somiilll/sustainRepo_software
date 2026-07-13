/**
 * ScopeTargetForm — one row per available scope. Scope 3 hidden when org
 * doesn't have scope-3 access. Empty rows are persisted as NA (unconfigured).
 */
import React, { useMemo } from 'react';
import { ALL_SCOPES, scopeLabel } from '../constants';
import TargetRow from './TargetRow';

export default function ScopeTargetForm({
  config,
  yearOptions,
  hasScope3,
  onEntryChange,
  onClearEntry,
  disabled,
}) {
  const visibleScopes = useMemo(
    () => ALL_SCOPES.filter((s) => !s.requiresScope3 || hasScope3),
    [hasScope3]
  );

  return (
    <div className="space-y-2" data-testid="scope-target-form">
      <div className="grid grid-cols-12 gap-3 px-3 pb-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        <div className="col-span-3">Scope</div>
        <div className="col-span-3">Target Year</div>
        <div className="col-span-2">Type</div>
        <div className="col-span-3">Target Value</div>
        <div className="col-span-1" />
      </div>
      {visibleScopes.map((scope) => (
        <TargetRow
          key={scope.id}
          label={scopeLabel(scope.id)}
          entry={config?.[scope.id]}
          yearOptions={yearOptions}
          onChange={(field, val) => onEntryChange(scope.id, field, val)}
          onClear={() => onClearEntry(scope.id)}
          testIdPrefix={`scope-${scope.id}`}
          disabled={disabled}
        />
      ))}
      <p className="text-xs text-text-muted px-3 pt-2">
        Leave a scope empty to mark it as <span className="font-medium">NA</span> (no target configured).
      </p>
    </div>
  );
}
