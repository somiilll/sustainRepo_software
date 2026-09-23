import React, { useMemo, useState } from 'react';
import { ArrowRight, Box, Factory, Leaf, Plane, Smartphone, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
];

const SCOPE_STYLE = {
  scope1: { label: 'Scope 1', color: '#059669', pill: 'bg-emerald-50 text-emerald-700', icon: Factory, iconWrap: 'bg-emerald-100 text-emerald-700' },
  scope2: { label: 'Scope 2', color: '#2563EB', pill: 'bg-blue-50 text-blue-700', icon: Zap, iconWrap: 'bg-blue-100 text-blue-700' },
  scope3: { label: 'Scope 3', color: '#7C3AED', pill: 'bg-violet-50 text-violet-700', icon: Box, iconWrap: 'bg-violet-100 text-violet-700' },
};

const formatValue = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

function getCategoryVisual(item) {
  const scope = SCOPE_STYLE[item.scope] || SCOPE_STYLE.scope1;
  const name = String(item.name || '').toLowerCase();
  if (name.includes('business travel')) return { ...scope, icon: Plane };
  if (name.includes('mobile combustion')) return { ...scope, icon: Smartphone };
  return scope;
}

export default function EmissionsByScopeCategoryList({ data = [], showScope3 = true }) {
  const [activeScope, setActiveScope] = useState('all');
  const navigate = useNavigate();

  const availableRows = useMemo(() => (data || []).filter((item) =>
    ['scope1', 'scope2', 'scope3'].includes(item.scope) && Number(item.value || 0) > 0,
  ), [data]);
  const scopedRows = useMemo(() => (
    activeScope === 'all' ? availableRows : availableRows.filter((item) => item.scope === activeScope)
  ), [activeScope, availableRows]);
  const activeTotal = useMemo(() => scopedRows.reduce((sum, item) => sum + Number(item.value || 0), 0), [scopedRows]);
  const rows = scopedRows.slice(0, 5);
  const maxValue = rows[0]?.value || 0;
  const filters = showScope3 ? FILTERS : FILTERS.filter((filter) => filter.id !== 'scope3');
  const showScopeTags = activeScope === 'all';

  return (
    <div data-testid="emissions-by-scope-category-list">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-900" data-testid="emissions-by-scope-category-title">Emissions by Scope &amp; Category</h3>
            <p className="mt-0.5 text-xs text-stone-500">Breakdown of total emissions across scopes and categories</p>
          </div>
        </div>
        <div className="shrink-0 text-right" data-testid="emissions-by-scope-category-total">
          <p className="text-[10px] font-semibold uppercase text-stone-500">Total emissions</p>
          <p className="text-sm font-bold tabular-nums text-stone-900">{formatValue(activeTotal)} <span className="text-[11px] font-medium text-stone-500">tCO₂e</span></p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Emission scope filter">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={activeScope === filter.id}
            onClick={() => setActiveScope(filter.id)}
            data-testid={`emission-category-filter-${filter.id}`}
            className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              activeScope === filter.id
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300 hover:text-teal-800'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-100">
        <div className="grid grid-cols-[minmax(0,1fr)_74px_44px] gap-2 border-b border-stone-100 bg-stone-50 px-3 py-2 text-[10px] font-semibold uppercase text-stone-500 sm:grid-cols-[minmax(150px,1fr)_minmax(96px,1.45fr)_auto_auto] sm:gap-3">
          <span>Category</span><span className="hidden sm:block">Relative emissions</span><span>Emissions</span><span>Share</span>
        </div>
        {rows.length ? (
          <div data-testid="emission-category-list-rows">
            {rows.map((item) => {
              const value = Number(item.value || 0);
              const name = String(item.name || 'Uncategorized');
              const visual = getCategoryVisual(item);
              const Icon = visual.icon;
              const percentage = activeTotal > 0 ? (value / activeTotal) * 100 : 0;
              const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;
              return (
                <div key={`${item.scope}-${name}`} className="grid grid-cols-[minmax(0,1fr)_74px_44px] items-center gap-2 border-b border-stone-100 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(150px,1fr)_minmax(96px,1.45fr)_auto_auto] sm:gap-3" data-testid={`emission-category-row-${item.scope}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual.iconWrap}`}><Icon className="h-4 w-4" aria-hidden="true" /></div>
                    <div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold leading-5 text-stone-800" title={name}>{name}</p>{showScopeTags && <span className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold ${visual.pill}`}>{visual.label}</span>}</div>
                  </div>
                  <div className="hidden h-2.5 overflow-hidden rounded-sm bg-stone-100 sm:block" aria-label={`${name} emissions bar`}><div className="h-full rounded-sm transition-[width] duration-500" style={{ width: `${width}%`, backgroundColor: visual.color }} /></div>
                  <span className="text-right text-xs font-bold tabular-nums text-stone-800">{formatValue(value)}</span>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-right text-[11px] font-semibold tabular-nums text-stone-600">{percentage.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-stone-400" data-testid="emission-category-list-empty">No emission categories for this scope in the selected window.</div>
        )}
        <div className="flex justify-end bg-stone-50 px-3 py-3">
          <button type="button" onClick={() => navigate('/emissions')} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 transition-colors hover:text-teal-900" data-testid="view-all-emission-categories-button">View all GHG data <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}