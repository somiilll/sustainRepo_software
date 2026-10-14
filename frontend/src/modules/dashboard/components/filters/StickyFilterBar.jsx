/**
 * StickyFilterBar — premium sticky header with title + collapsible filter
 * panel. Wraps the existing DashboardFilters (no behaviour change) so we
 * don't reimplement filter state management.
 */
import React from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, Sparkles, Download } from 'lucide-react';
import DashboardFilters from '../../../../pages/dashboard/components/DashboardFilters';
import NotificationBell from '../../../../components/NotificationBell';
import { SecureFileImage } from '../../../../components/SecureFileImage';

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
  organizationLogo = null,
  organizationName = '',
}) {
  return (
    <div
      className="-mx-4 px-6 pt-3 pb-4 mb-4 relative z-50 bg-white border-b border-stone-200/70 shadow-[0_1px_0_0_rgba(0,0,0,0.02)] lg:-mx-5 lg:px-8"
      data-testid="sticky-filter-bar"
    >
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg flex items-center justify-center border border-emerald-100 bg-white text-white shadow-md" data-testid="dashboard-header-brand-mark">
            <SecureFileImage source={organizationLogo} alt={`${organizationName || 'Organization'} logo`} className="h-full w-full object-contain" testId="dashboard-header-organization-logo" fallback={<span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600"><Sparkles className="w-4 h-4" aria-hidden="true" data-testid="dashboard-header-fallback-icon" /></span>} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-heading font-bold text-stone-900 truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-stone-500 truncate">{subtitle}</p>}
          </div>
          {liveBadge}
        </div>
        <div className="flex items-center gap-2">
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
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 border border-stone-200 hover:border-stone-300 bg-white rounded-lg px-3 py-1.5 transition-colors"
                data-testid="export-btn"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            )
          )}
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
      </div>
      {showFilters && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <DashboardFilters {...filterProps} />
        </div>
      )}
    </div>
  );
}
