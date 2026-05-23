/**
 * StickyFilterBar — premium sticky header with title + collapsible filter
 * panel. Wraps the existing DashboardFilters (no behaviour change) so we
 * don't reimplement filter state management.
 */
import React from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, Sparkles } from 'lucide-react';
import DashboardFilters from '../../../../pages/dashboard/components/DashboardFilters';

export default function StickyFilterBar({
  title = 'Executive Dashboard',
  subtitle,
  liveBadge = null,
  showFilters,
  setShowFilters,
  filterProps,
}) {
  return (
    <div
      className="sticky top-0 z-30 -mx-4 px-4 md:-mx-6 md:px-6 py-3 backdrop-blur-xl bg-white/75 border-b border-stone-200/70 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]"
      data-testid="sticky-filter-bar"
    >
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-heading font-bold text-stone-900 truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-stone-500 truncate">{subtitle}</p>}
          </div>
          {liveBadge}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 border border-stone-200 hover:border-stone-300 bg-white rounded-lg px-3 py-1.5 transition-colors"
          data-testid="toggle-filters-btn"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {showFilters ? 'Hide filters' : 'Show filters'}
          {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {showFilters && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <DashboardFilters {...filterProps} />
        </div>
      )}
    </div>
  );
}
