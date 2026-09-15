import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
];

const formatValue = (value) => Number(value || 0).toLocaleString('en-IN', {
  maximumFractionDigits: 0,
});

export default function EmissionsByScopeCategoryList({ data = [], showScope3 = true }) {
  const [activeScope, setActiveScope] = useState('all');
  const navigate = useNavigate();

  const availableRows = useMemo(() => (data || []).filter((item) =>
    ['scope1', 'scope2', 'scope3'].includes(item.scope) && Number(item.value || 0) > 0,
  ), [data]);

  const scopedRows = useMemo(() => (
    activeScope === 'all' ? availableRows : availableRows.filter((item) => item.scope === activeScope)
  ), [activeScope, availableRows]);

  const total = useMemo(() => scopedRows.reduce((sum, item) => sum + Number(item.value || 0), 0), [scopedRows]);
  const rows = scopedRows.slice(0, 5);
  const maxValue = rows[0]?.value || 0;
  const filters = showScope3 ? FILTERS : FILTERS.filter((filter) => filter.id !== 'scope3');

  return (
    <div data-testid="emissions-by-scope-category-list">
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Emission scope filter">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={activeScope === filter.id}
            onClick={() => setActiveScope(filter.id)}
            data-testid={`emission-category-filter-${filter.id}`}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              activeScope === filter.id
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300 hover:text-teal-800'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {rows.length ? (
        <div className="space-y-3" data-testid="emission-category-list-rows">
          {rows.map((item) => {
            const value = Number(item.value || 0);
            const name = String(item.name || 'Uncategorized');
            const percentage = total > 0 ? (value / total) * 100 : 0;
            const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;
            return (
              <div key={`${item.scope}-${name}`} className="grid grid-cols-[minmax(0,1fr)_minmax(96px,1.15fr)_auto] items-center gap-3" data-testid={`emission-category-row-${item.scope}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
                <span className="truncate text-xs font-medium text-stone-700" title={name}>{name}</span>
                <div className="h-2 overflow-hidden rounded-sm bg-stone-100" aria-label={`${name} emissions bar`}>
                  <div className="h-full rounded-sm bg-teal-600 transition-[width] duration-500" style={{ width: `${width}%` }} />
                </div>
                <div className="min-w-[82px] text-right text-[11px] tabular-nums text-stone-500">
                  <span className="font-semibold text-stone-800">{formatValue(value)}</span>
                  <span className="ml-2">{percentage.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-stone-400" data-testid="emission-category-list-empty">
          No emission categories for this scope in the selected window.
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => navigate('/emissions')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 transition-colors hover:text-teal-900"
          data-testid="view-all-emission-categories-button"
        >
          View all categories <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}