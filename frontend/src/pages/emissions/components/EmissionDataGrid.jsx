import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Activity, FileText, Edit, History, Trash2, ArrowUpDown, ArrowUp, ArrowDown, GripVertical, MoreHorizontal } from 'lucide-react';
import { getStatusDisplay } from '../../../modules/ghg/utils/approvalSchema';
import { format } from 'date-fns';
import { resolveEmissionQuantity } from '../../../modules/ghg/emissions/shared/utils/emissionQuantity';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';

/**
 * EmissionDataGrid
 *
 * Renders the enterprise data grid for the Emissions page (header row, data rows, empty state).
 * Features:
 * - Sortable columns (Facility, Period, Category, Sub-category, Quantity, Activity, Method, Activity/Fuel, Type, Last Updated At)
 * - Last Updated At column showing updated_at or created_at
 */

// Sortable header component
const SortableHeader = ({ label, sortKey, currentSort, onSort, className = '' }) => {
  const isActive = currentSort.key === sortKey;
  const Icon = isActive ? (currentSort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex w-full min-w-0 items-center gap-1 hover:text-stone-900 transition-colors ${className}`}
      data-testid={`emissions-sort-${sortKey}`}
    >
      <span className="truncate">{label}</span>
      <Icon className={`h-3 w-3 shrink-0 ${isActive ? 'text-emerald-600' : 'text-stone-400'}`} />
    </button>
  );
};

const DEFAULT_COLUMN_WIDTHS = {
  facility: 120,
  period: 88,
  category: 180,
  type: 96,
  activity: 210,
  method: 112,
  emissions: 112,
  status: 120,
  updated: 130,
  actions: 40,
};

const ResizableColumnHeader = ({ columnKey, width, onResize, children }) => {
  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const resize = (moveEvent) => onResize(columnKey, startWidth + moveEvent.clientX - startX);
    const stopResize = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResize);
    };
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stopResize);
  };

  return (
    <div className="relative flex min-w-0 flex-shrink-0 items-center justify-center" style={{ width }} data-testid={`emissions-column-header-${columnKey}`}>
      {children}
      <button
        type="button"
        onPointerDown={startResize}
        className="absolute right-0 top-0 z-20 flex h-full w-4 touch-none items-center justify-center bg-stone-50/90 text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700 cursor-col-resize"
        aria-label="Resize column"
        title={`Resize ${columnKey} column`}
        data-testid={`emissions-resize-column-${columnKey}`}
      ><GripVertical className="h-3.5 w-3.5" /></button>
    </div>
  );
};

// Status display helper - shows pending proposal indicator
const StatusCell = ({ emission }) => {
  const baseStatus = getStatusDisplay(emission.approval_status);
  
  // Show user's own pending proposal as "Completed, Awaiting Approval"
  if (emission.is_my_pending_proposal) {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700" data-testid={`emission-status-${emission.id}`}>
        Completed, Awaiting Approval
      </span>
    );
  }
  
  // For others viewing a record where someone else has pending proposal,
  // just show the normal status (Completed, Approved) - no extra badge
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${baseStatus.cls}`} data-testid={`emission-status-${emission.id}`}>
      {baseStatus.text}
    </span>
  );
};

const EmissionRowActions = ({ emission, isRegularUser, hideHistoryActions, handleEdit, fetchHistory, openDeleteConfirm }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" size="icon" variant="ghost" onClick={(event) => event.stopPropagation()} className="h-8 w-8" aria-label={`More actions for emission ${emission.id}`} data-testid={`emission-actions-menu-${emission.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="bg-white opacity-100" data-testid={`emission-actions-menu-content-${emission.id}`}>
      <DropdownMenuItem onSelect={(event) => { event.stopPropagation(); handleEdit(emission); }} data-testid={`edit-emission-${emission.id}`}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
      {!isRegularUser && !hideHistoryActions && <DropdownMenuItem onSelect={(event) => { event.stopPropagation(); fetchHistory(emission); }} data-testid={`history-emission-${emission.id}`}><History className="mr-2 h-4 w-4" />View version history</DropdownMenuItem>}
      <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={(event) => { event.stopPropagation(); openDeleteConfirm(emission); }} data-testid={`delete-emission-${emission.id}`}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default function EmissionDataGrid({
  activeScope,
  filteredEmissions,
  facilities,
  filteredScope3Activities,
  getMethodLabel,
  isRegularUser,
  hideHistoryActions = false,
  handleEdit,
  fetchHistory,
  openDeleteConfirm,
  onBulkDelete,
  showFilters,
  filterFacility,
  filterDateRange,
  filterCategory,
  filterFrequency,
}) {
  // Sorting state
  const [sort, setSort] = useState({ key: null, direction: 'desc' });
  
  // Selection state for bulk delete
  const [selectedIds, setSelectedIds] = useState(new Set());
  const ledgerScrollRef = useRef(null);
  const bottomScrollbarRef = useRef(null);
  const [ledgerScrollWidth, setLedgerScrollWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(localStorage.getItem('emission-log-column-widths-v4') || '{}') };
    } catch {
      return DEFAULT_COLUMN_WIDTHS;
    }
  });

  useEffect(() => {
    localStorage.setItem('emission-log-column-widths-v4', JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    const ledger = ledgerScrollRef.current;
    const bottomScrollbar = bottomScrollbarRef.current;
    if (!ledger || !bottomScrollbar) return undefined;
    const syncDimensions = () => {
      setLedgerScrollWidth(ledger.scrollWidth);
    };
    const syncBottomScrollbar = () => {
      if (bottomScrollbar.scrollLeft !== ledger.scrollLeft) bottomScrollbar.scrollLeft = ledger.scrollLeft;
    };
    const syncLedger = () => {
      if (ledger.scrollLeft !== bottomScrollbar.scrollLeft) ledger.scrollLeft = bottomScrollbar.scrollLeft;
    };
    syncDimensions();
    ledger.addEventListener('scroll', syncBottomScrollbar, { passive: true });
    bottomScrollbar.addEventListener('scroll', syncLedger, { passive: true });
    const observer = new ResizeObserver(syncDimensions);
    observer.observe(ledger);
    return () => {
      ledger.removeEventListener('scroll', syncBottomScrollbar);
      bottomScrollbar.removeEventListener('scroll', syncLedger);
      observer.disconnect();
    };
  }, [activeScope, columnWidths, filteredEmissions.length]);
  
  // Handle sort toggle
  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  // Handle row selection
  const handleSelectRow = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  
  // Handle select all
  const handleSelectAll = () => {
    if (selectedIds.size === filteredEmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmissions.map(e => e.id)));
    }
  };

  const resizeColumn = (columnKey, width) => {
    setColumnWidths((current) => ({ ...current, [columnKey]: Math.min(420, Math.max(80, Math.round(width))) }));
  };

  const columnStyle = (columnKey) => ({ width: columnWidths[columnKey] });

  const formatReportingPeriod = (period) => {
    if (!period) return '-';
    const financialYear = String(period).match(/^FY\s*(\d{4})\s*-\s*(\d{2}|\d{4})$/i);
    if (!financialYear) return period;
    return `FY ${financialYear[1].slice(-2)}-${financialYear[2].slice(-2)}`;
  };
  
  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.size > 0 && onBulkDelete) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };
  
  const isAllSelected = filteredEmissions.length > 0 && selectedIds.size === filteredEmissions.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredEmissions.length;
  
  // Get facility name for sorting
  const getFacilityName = (emission) => {
    const facility = facilities.find(f => f.id === emission.facility_id);
    return facility?.name || '';
  };
  
  // Get last updated timestamp
  const getLastUpdatedAt = (emission) => {
    return emission.updated_at || emission.created_at;
  };
  
  // Format date for display
  const formatLastUpdated = (emission) => {
    const timestamp = getLastUpdatedAt(emission);
    if (!timestamp) return '-';
    try {
      return format(new Date(timestamp), 'dd MMM yyyy HH:mm');
    } catch {
      return '-';
    }
  };
  
  // Get quantity value for sorting
  const getQuantityValue = (emission) => {
    return parseFloat(resolveEmissionQuantity(emission).value) || 0;
  };
  
  // Sorted emissions
  const sortedEmissions = useMemo(() => {
    if (!sort.key) return filteredEmissions;
    
    return [...filteredEmissions].sort((a, b) => {
      let aVal, bVal;
      
      switch (sort.key) {
        case 'facility':
          aVal = getFacilityName(a).toLowerCase();
          bVal = getFacilityName(b).toLowerCase();
          break;
        case 'period':
          aVal = a.reporting_period || '';
          bVal = b.reporting_period || '';
          break;
        case 'category':
          aVal = (a.category || '').toLowerCase();
          bVal = (b.category || '').toLowerCase();
          break;
        case 'subcategory':
          aVal = (a.sub_category || a.fuel_type || '').toLowerCase();
          bVal = (b.sub_category || b.fuel_type || '').toLowerCase();
          break;
        case 'quantity':
          aVal = getQuantityValue(a);
          bVal = getQuantityValue(b);
          break;
        case 'activity':
          aVal = (a.scope3_activity || a.sub_category || '').toLowerCase();
          bVal = (b.scope3_activity || b.sub_category || '').toLowerCase();
          break;
        case 'method':
          aVal = (a.calculation_method_scope3 || '').toLowerCase();
          bVal = (b.calculation_method_scope3 || '').toLowerCase();
          break;
        case 'activityFuel':
          aVal = (a.fuel_type || a.sub_category || '').toLowerCase();
          bVal = (b.fuel_type || b.sub_category || '').toLowerCase();
          break;
        case 'type':
          aVal = (a.biogenic_scope_selection || '').toLowerCase();
          bVal = (b.biogenic_scope_selection || '').toLowerCase();
          break;
        case 'lastUpdated':
          aVal = getLastUpdatedAt(a) || '';
          bVal = getLastUpdatedAt(b) || '';
          break;
        case 'emissions':
          aVal = a.outputs?.co2e?.value || a.co2e_emissions || a.total_emissions || 0;
          bVal = b.outputs?.co2e?.value || b.co2e_emissions || b.total_emissions || 0;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmissions, sort, facilities]);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white" data-testid="emissions-ledger">
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-amber-800">
            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            className="bg-red-600 hover:bg-red-700"
            data-testid="bulk-delete-btn"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Selected
          </Button>
        </div>
      )}
      
      <div ref={ledgerScrollRef} className="h-[min(70vh,52rem)] overflow-auto" data-testid="emissions-ledger-scroll-region">
      {/* Fixed Header Row */}
      <div className="min-w-max sticky top-0 z-10 bg-stone-50 border-b border-stone-200 px-4 py-3">
        <div className="flex min-w-max items-center gap-2 bg-stone-50 text-xs font-semibold text-stone-600 uppercase tracking-wider">
          {/* Select All Checkbox */}
          <div className="w-8 flex-shrink-0 flex items-center justify-center">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={handleSelectAll}
              className={isSomeSelected ? 'data-[state=checked]:bg-amber-500' : ''}
              aria-label="Select all visible emission rows"
              data-testid="select-all-checkbox"
            />
          </div>
          
          {/* Scope 3 Headers */}
          {activeScope === 'scope3' && (
            <>
              <ResizableColumnHeader columnKey="facility" width={columnWidths.facility} onResize={resizeColumn}>
                <SortableHeader label="Facility" sortKey="facility" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="period" width={columnWidths.period} onResize={resizeColumn}>
                <SortableHeader label="Period" sortKey="period" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="category" width={columnWidths.category} onResize={resizeColumn}>
                <SortableHeader label="Category" sortKey="category" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="activity" width={columnWidths.activity} onResize={resizeColumn}>
                <SortableHeader label="Activity" sortKey="activity" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="method" width={columnWidths.method} onResize={resizeColumn}>
                <SortableHeader label="Method" sortKey="method" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="emissions" width={columnWidths.emissions} onResize={resizeColumn}>
                <SortableHeader label="tCO₂e" sortKey="emissions" currentSort={sort} onSort={handleSort} className="justify-center normal-case" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="status" width={columnWidths.status} onResize={resizeColumn}><span className="w-full text-center">Status</span></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="updated" width={columnWidths.updated} onResize={resizeColumn}><SortableHeader label="Updated" sortKey="lastUpdated" currentSort={sort} onSort={handleSort} className="justify-center" /></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="actions" width={columnWidths.actions} onResize={resizeColumn}><span className="sr-only">More actions</span></ResizableColumnHeader>
            </>
          )}
          {/* Scope 1 & 2 Headers */}
          {(activeScope === 'scope1' || activeScope === 'scope2') && (
            <>
              <ResizableColumnHeader columnKey="facility" width={columnWidths.facility} onResize={resizeColumn}>
                <SortableHeader label="Facility" sortKey="facility" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="period" width={columnWidths.period} onResize={resizeColumn}>
                <SortableHeader label="Period" sortKey="period" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="category" width={columnWidths.category} onResize={resizeColumn}>
                <SortableHeader label="Category" sortKey="category" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="activity" width={columnWidths.activity} onResize={resizeColumn}>
                <SortableHeader label="Sub-category" sortKey="subcategory" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="emissions" width={columnWidths.emissions} onResize={resizeColumn}>
                <SortableHeader label="tCO₂e" sortKey="emissions" currentSort={sort} onSort={handleSort} className="justify-center normal-case" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="status" width={columnWidths.status} onResize={resizeColumn}><span className="w-full text-center">Status</span></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="updated" width={columnWidths.updated} onResize={resizeColumn}><SortableHeader label="Updated" sortKey="lastUpdated" currentSort={sort} onSort={handleSort} className="justify-center" /></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="actions" width={columnWidths.actions} onResize={resizeColumn}><span className="sr-only">More actions</span></ResizableColumnHeader>
            </>
          )}
          {/* Biogenic Headers */}
          {activeScope === 'biogenic' && (
            <>
              <ResizableColumnHeader columnKey="facility" width={columnWidths.facility} onResize={resizeColumn}>
                <SortableHeader label="Facility" sortKey="facility" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="period" width={columnWidths.period} onResize={resizeColumn}>
                <SortableHeader label="Period" sortKey="period" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="type" width={columnWidths.type} onResize={resizeColumn}>
                <SortableHeader label="Type" sortKey="type" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="category" width={columnWidths.category} onResize={resizeColumn}>
                <SortableHeader label="Category" sortKey="category" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="activity" width={columnWidths.activity} onResize={resizeColumn}>
                <SortableHeader label="Activity / Fuel" sortKey="activityFuel" currentSort={sort} onSort={handleSort} className="justify-center" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="emissions" width={columnWidths.emissions} onResize={resizeColumn}>
                <SortableHeader label="tCO₂e" sortKey="emissions" currentSort={sort} onSort={handleSort} className="justify-center normal-case" />
              </ResizableColumnHeader>
              <ResizableColumnHeader columnKey="status" width={columnWidths.status} onResize={resizeColumn}><span className="w-full text-center">Status</span></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="updated" width={columnWidths.updated} onResize={resizeColumn}><SortableHeader label="Updated" sortKey="lastUpdated" currentSort={sort} onSort={handleSort} className="justify-center" /></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="actions" width={columnWidths.actions} onResize={resizeColumn}><span className="sr-only">More actions</span></ResizableColumnHeader>
            </>
          )}
        </div>
      </div>

      {/* Data Rows */}
      <div className="divide-y divide-stone-100">
        {sortedEmissions.map((emission) => {
          const facility = facilities.find(f => f.id === emission.facility_id);
          const dfv = emission.dynamic_field_values || {};
          const hasOverride = Object.values(dfv).some(field => field?.is_override === true);
          const calcMethod = emission.calculation_method_scope3 || dfv.calculation_method_scope3;
          const totalEmissions = emission.outputs?.co2e?.value || emission.co2e_emissions || emission.total_emissions || 0;

          // Get activity/sub-category display
          // For Scope 3 OR Biogenic Scope 3, look up the activity label using scope3_ef_id
          let activityDisplay = '-';
          const isBiogenicScope3 = emission.scope === 'biogenic' &&
            (emission.biogenic_scope_selection === 'scope3' || dfv.biogenic_scope_selection?.value === 'scope3');

          if (emission.scope === 'scope3' || isBiogenicScope3) {
            // First try to find the label by scope3_ef_id
            if (emission.scope3_ef_id) {
              const matchedEf = filteredScope3Activities.find(a => a.id === emission.scope3_ef_id);
              if (matchedEf) {
                activityDisplay = matchedEf.activity || matchedEf.fuel_name || emission.scope3_activity || '-';
              } else {
                // Fallback to stored scope3_activity if no match found
                activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
              }
            } else {
              // No scope3_ef_id - use scope3_activity (common for supplier_basis with custom activity)
              activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
            }
          } else {
            activityDisplay = emission.sub_category || emission.fuel_type || '-';
          }

          const isProcessEmission = emission.category?.toLowerCase().includes('process');
          const rawProcessType = emission.process_type || dfv.process_type?.value || '';
          const processTypeLabels = {
            venting: 'Venting',
            n2o_overall_combustion: 'N2O from Overall Combustion',
            ch4_overall_combustion: 'CH4 from Overall Combustion',
          };
          const processTypeDisplay = isProcessEmission
            ? processTypeLabels[rawProcessType] || rawProcessType.replaceAll('_', ' ') || '-'
            : '-';
          const subcategoryDisplay = isProcessEmission ? processTypeDisplay : activityDisplay;
          const methodDisplay = getMethodLabel(calcMethod, true);

          // Extract year from reporting period
          const reportingYear = emission.reporting_period?.match(/\d{4}/)?.[0] || emission.reporting_year || '-';

          // Biogenic scope type
          const biogenicScope = emission.biogenic_scope_selection ||
            (dfv.biogenic_scope_selection?.value) ||
            (emission.scope === 'biogenic' ? 'Direct' : '-');

          return (
            <div
              key={emission.id}
              className={`min-w-max px-4 py-3 flex items-center gap-2 hover:bg-green-50/50 transition-colors cursor-pointer group ${selectedIds.has(emission.id) ? 'bg-amber-50' : ''}`}
              onClick={() => handleSelectRow(emission.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectRow(emission.id);
                }
              }}
              role="checkbox"
              aria-checked={selectedIds.has(emission.id)}
              tabIndex={0}
              data-testid={`emission-row-${emission.id}`}
            >
              {/* Row Checkbox */}
              <div className="w-8 flex-shrink-0 flex items-center justify-center">
                <Checkbox
                  checked={selectedIds.has(emission.id)}
                  onCheckedChange={() => handleSelectRow(emission.id)}
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`select-emission-${emission.id}`}
                />
              </div>
              
              {/* Scope 3 Row */}
              {activeScope === 'scope3' && (
                <>
                  <div className="flex-shrink-0 text-center" style={columnStyle('facility')}>
                    <p className="w-full text-center text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-center text-sm text-text-secondary truncate" style={columnStyle('period')} title={emission.reporting_period}>
                    {formatReportingPeriod(emission.reporting_period || reportingYear)}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('category')}>
                    <p className="w-full text-center text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('activity')}>
                    <p className="min-w-0 text-center text-sm text-text-primary truncate" title={activityDisplay}>
                      {activityDisplay}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('method')}>
                    <span className="inline-flex px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-medium rounded">
                      {methodDisplay}
                    </span>
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('emissions')}>
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('status')}>
                    <StatusCell emission={emission} />
                  </div>
                  <div className="flex-shrink-0 text-center text-xs text-text-secondary" style={columnStyle('updated')} title={getLastUpdatedAt(emission) || ''} data-testid={`emission-updated-at-${emission.id}`}>
                    {formatLastUpdated(emission)}
                  </div>
                </>
              )}

              {/* Scope 1 & 2 Row */}
              {(activeScope === 'scope1' || activeScope === 'scope2') && (
                <>
                  <div className="flex-shrink-0 text-center" style={columnStyle('facility')}>
                    <p className="w-full text-center text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-center text-sm text-text-secondary truncate" style={columnStyle('period')} title={emission.reporting_period}>
                    {formatReportingPeriod(emission.reporting_period || reportingYear)}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('category')}>
                    <p className="w-full text-center text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('activity')}>
                    <p className="min-w-0 text-center text-sm text-text-primary truncate" title={subcategoryDisplay} data-testid={`emission-subcategory-${emission.id}`}>
                      {subcategoryDisplay}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('emissions')}>
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('status')}>
                    <StatusCell emission={emission} />
                  </div>
                  <div className="flex-shrink-0 text-center text-xs text-text-secondary" style={columnStyle('updated')} title={getLastUpdatedAt(emission) || ''} data-testid={`emission-updated-at-${emission.id}`}>
                    {formatLastUpdated(emission)}
                  </div>
                </>
              )}

              {/* Biogenic Row */}
              {activeScope === 'biogenic' && (
                <>
                  <div className="flex-shrink-0 text-center" style={columnStyle('facility')}>
                    <p className="w-full text-center text-sm font-medium text-text-primary truncate" title={facility?.name}>
                      {facility?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-center text-sm text-text-secondary truncate" style={columnStyle('period')} title={emission.reporting_period}>
                    {formatReportingPeriod(emission.reporting_period || reportingYear)}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('type')}>
                    <span className="inline-flex px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                      {biogenicScope === 'scope1' ? 'Direct' : biogenicScope === 'scope3' ? 'Indirect' : biogenicScope}
                    </span>
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('category')}>
                    <p className="w-full text-center text-sm text-text-primary truncate" title={emission.category}>
                      {emission.category}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('activity')}>
                    <p className="min-w-0 text-center text-sm text-text-primary truncate" title={
                      biogenicScope === 'scope3'
                        ? activityDisplay
                        : (emission.fuel_type || emission.sub_category || activityDisplay || '-')
                    }>
                      {biogenicScope === 'scope3'
                        ? activityDisplay
                        : (emission.fuel_type || emission.sub_category || activityDisplay || '-')}
                    </p>
                    {hasOverride && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                        Custom
                      </span>
                    )}
                    {emission.evidence_url && (
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                    )}
                  </div>
                  <div className="flex-shrink-0 text-center" style={columnStyle('emissions')}>
                    <span className="text-sm font-semibold text-primary">
                      {totalEmissions.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center gap-2 text-center" style={columnStyle('status')}>
                    <StatusCell emission={emission} />
                  </div>
                  <div className="flex-shrink-0 text-center text-xs text-text-secondary" style={columnStyle('updated')} title={getLastUpdatedAt(emission) || ''} data-testid={`emission-updated-at-${emission.id}`}>
                    {formatLastUpdated(emission)}
                  </div>
                </>
              )}

              <div className="flex flex-shrink-0 items-center justify-center" style={columnStyle('actions')}>
                <EmissionRowActions emission={emission} isRegularUser={isRegularUser} hideHistoryActions={hideHistoryActions} handleEdit={handleEdit} fetchHistory={fetchHistory} openDeleteConfirm={openDeleteConfirm} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredEmissions.length === 0 && (
        <div className="text-center py-12 border-t border-stone-100">
          <Activity className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
            No {activeScope === 'biogenic' ? 'Biogenic' : `Scope ${activeScope.slice(-1)}`} emissions
          </h3>
          <p className="text-text-secondary mb-4">
            {showFilters && (filterFacility || filterDateRange.from || filterDateRange.to || filterCategory || filterFrequency)
              ? 'Try adjusting your filters'
              : 'Add your first emission record'}
          </p>
        </div>
      )}
      </div>
      <div ref={bottomScrollbarRef} className="h-4 overflow-x-scroll overflow-y-hidden border-t border-stone-200 bg-white" style={{ scrollbarGutter: 'stable' }} aria-label="Scroll ledger columns horizontally" data-testid="emissions-ledger-bottom-scrollbar">
        <div className="h-px" style={{ width: ledgerScrollWidth }} data-testid="emissions-ledger-bottom-scrollbar-track" />
      </div>
    </div>
  );
}
