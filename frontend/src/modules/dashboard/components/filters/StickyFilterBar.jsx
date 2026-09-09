/**
 * StickyFilterBar — premium sticky header with title + collapsible filter
 * panel. Wraps the existing DashboardFilters (no behaviour change) so we
 * don't reimplement filter state management.
 */
import React from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, Download } from 'lucide-react';
import DashboardFilters from '../../../../pages/dashboard/components/DashboardFilters';
import NotificationBell from '../../../../components/NotificationBell';

export default function StickyFilterBar({
  title = 'Executive Dashboard',
  subtitle,
  liveBadge = null,
  showFilters,
  setShowFilters,
  filterProps,
  onExport,
  showExport = true,
  exportButton, // Custom export button component (e.g., ExportPDFButton)
  // Dashboard type toggle
  dashboardType = 'esg', // 'ghg' | 'esg'
  setDashboardType,
  esgSection = 'all', // 'all' | 'environment' | 'social' | 'governance'
  setEsgSection,
  showDashboardToggle = false,
}) {
  return (
    <div
      className="sticky top-0 z-30 -mx-4 border-b border-stone-200 bg-white px-4 py-4 shadow-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      data-testid="sticky-filter-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-lg font-bold text-stone-900" data-testid="dashboard-page-title">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-xs font-medium text-stone-500" data-testid="dashboard-page-subtitle">{subtitle}</p>}
          {liveBadge}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Dashboard Type Toggle */}
          {showDashboardToggle && (
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5" data-testid="dashboard-type-toggle">
              <button
                onClick={() => setDashboardType?.('ghg')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dashboardType === 'ghg'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                data-testid="toggle-ghg"
              >
                GHG
              </button>
              <div className="relative">
                <button
                  onClick={() => setDashboardType?.('esg')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                    dashboardType === 'esg'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  data-testid="toggle-esg"
                >
                  ESG
                  {dashboardType === 'esg' }
                </button>
              </div>
            </div>
          )}
          {/* ESG Section Dropdown */}
          {showDashboardToggle && dashboardType === 'esg' && (
            <select
              value={esgSection}
              onChange={(e) => setEsgSection?.(e.target.value)}
              className="text-xs font-medium text-stone-700 border border-stone-200 hover:border-stone-300 bg-white rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
              data-testid="esg-section-select"
            >
              <option value="all">All</option>
              <option value="environment">Environment</option>
              <option value="social">Social</option>
              <option value="governance">Governance</option>
            </select>
          )}
          <NotificationBell />
          {/* Export Button - Custom or Default */}
          {showExport && (
            exportButton || (
              <button
                onClick={onExport}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-[background-color,border-color] duration-200 hover:border-stone-300 hover:bg-stone-50"
                data-testid="export-btn"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            )
          )}
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-[background-color,border-color] duration-200 hover:border-stone-300 hover:bg-stone-50"
            data-testid="toggle-filters-btn"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showFilters ? 'Hide filters' : 'Show filters'}
            {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <DashboardFilters {...filterProps} />
        </div>
      )}
    </div>
  );
}
