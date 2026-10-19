/**
 * CategoryTreeRenderer + CategoryTargetForm — hierarchical scope→category
 * picker. Each category row is independently configurable; unconfigured
 * categories persist as NA.
 *
 * Composite keys are `<scope>:<categoryId>` (e.g. `scope1:stationary_combustion`).
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ALL_SCOPES, CATEGORY_CATALOG, scopeLabel } from '../constants';
import TargetRow from './TargetRow';

const composeKey = (scopeId, catId) => `${scopeId}:${catId}`;

export default function CategoryTargetForm({
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

  const [openScopes, setOpenScopes] = useState(() => {
    // Default: open all scopes that have at least one configured category.
    const init = {};
    visibleScopes.forEach((s) => {
      const hasConfig = (CATEGORY_CATALOG[s.id] || []).some(
        (c) => config?.[composeKey(s.id, c.id)]
      );
      init[s.id] = hasConfig || s.id === 'scope1';
    });
    return init;
  });

  const toggleScope = (id) =>
    setOpenScopes((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-3" data-testid="category-target-form">
      <p className="text-xs text-text-muted">
        Configure targets per category. Scopes / categories you skip are treated as
        <span className="font-medium"> NA</span>.
      </p>
      {visibleScopes.map((scope) => {
        const cats = CATEGORY_CATALOG[scope.id] || [];
        const open = openScopes[scope.id];
        const configuredCount = cats.filter((c) => config?.[composeKey(scope.id, c.id)]).length;
        return (
          <div
            key={scope.id}
            className="border border-stone-200 rounded-lg overflow-hidden bg-white"
            data-testid={`category-scope-${scope.id}`}
          >
            <button
              type="button"
              onClick={() => toggleScope(scope.id)}
              className="w-full flex items-center justify-between px-4 py-2 bg-stone-50 hover:bg-stone-100 transition-colors"
              data-testid={`category-scope-toggle-${scope.id}`}
            >
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="text-sm font-semibold">{scopeLabel(scope.id)}</span>
                <span className="text-[11px] text-text-muted">
                  {configuredCount > 0
                    ? `${configuredCount} of ${cats.length} configured`
                    : `${cats.length} categories`}
                </span>
              </div>
            </button>
            {open && (
              <div className="px-3 py-3 space-y-2">
                <div className="grid grid-cols-12 gap-3 px-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  <div className="col-span-3">Category</div>
                  <div className="col-span-2">Target Year</div>
                  <div className="col-span-4">Type</div>
                  <div className="col-span-2">Target Value</div>
                  <div className="col-span-1" />
                </div>
                {cats.map((cat) => {
                  const key = composeKey(scope.id, cat.id);
                  return (
                    <TargetRow
                      key={key}
                      label={cat.name}
                      entry={config?.[key]}
                      yearOptions={yearOptions}
                      onChange={(field, val) => onEntryChange(key, field, val)}
                      onClear={() => onClearEntry(key)}
                      testIdPrefix={`category-${key}`}
                      disabled={disabled}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
