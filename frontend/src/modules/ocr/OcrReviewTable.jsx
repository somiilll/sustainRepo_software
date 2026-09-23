import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Edit3, GripVertical, MoreHorizontal, RotateCcw, Search, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';

const scopeTone = {
  scope1: 'bg-red-50 text-red-800 border-red-200',
  scope2: 'bg-blue-50 text-blue-800 border-blue-200',
  scope3: 'bg-amber-50 text-amber-900 border-amber-200',
  water: 'bg-cyan-50 text-cyan-900 border-cyan-200',
};

const normalizedConfidence = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(String(value).trim().replace(/%$/, ''));
  if (!Number.isFinite(numeric)) return null;
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

const confidenceLabel = (value) => {
  const score = normalizedConfidence(value);
  return score === null ? 'Not available' : `${score}%`;
};

const Confidence = ({ value, itemId }) => {
  const score = normalizedConfidence(value);
  const tone = score === null ? 'text-slate-500' : score >= 85 ? 'text-emerald-700' : score >= 70 ? 'text-amber-700' : 'text-red-700';
  return <span className={`text-sm font-medium ${tone}`} data-testid={`ocr-confidence-${itemId}`}>{score === null ? 'Not available' : `${score}%`}</span>;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';
const displayValue = (value) => hasValue(value) ? value : '—';

const quantityValue = (values) => hasValue(values.quantity)
  ? `${values.quantity}${values.unit ? ` ${values.unit}` : ''}`
  : '—';

const categoryCode = (values) => [values.category_code, values.category_key, values.category]
  .filter(Boolean)
  .join(' ')
  .toLowerCase();
const isFreight = (values) => /\bc[49]\b|\bcat_[49]\b|(?:upstream|downstream)[_\s-]*transportation/.test(categoryCode(values));
const isBusinessTravel = (values) => /\bc6\b|\bcat_6\b|business[_\s-]*travel/.test(categoryCode(values));
const dynamicInput = (values, key) => values.dynamic_field_values?.[key] || null;
const inputValue = (values, key, fallback, unit) => {
  const input = dynamicInput(values, key);
  const value = input?.value ?? fallback;
  if (!hasValue(value)) return '—';
  const resolvedUnit = input?.unit || unit;
  return `${value}${resolvedUnit ? ` ${resolvedUnit}` : ''}`;
};
const goodsTravelledValue = (values) => inputValue(values, 'qty_travelled', values.quantity_goods ?? (isFreight(values) ? values.quantity : ''), values.unit_goods || (isFreight(values) ? values.unit : 't'));
const travelledDistanceValue = (values) => inputValue(values, 'km_travelled', values.distance_km, 'km');
const passengersValue = (values) => isBusinessTravel(values) ? inputValue(values, 'qty_passenger', values.passengers, '') : '—';
const daysTravelledValue = (values) => isBusinessTravel(values) ? inputValue(values, 'qty_days_travelled', values.days_travelled, '') : '—';
const roomsValue = (values) => isBusinessTravel(values) ? inputValue(values, 'qty_room', values.rooms, '') : '—';
const nightsValue = (values) => isBusinessTravel(values) ? inputValue(values, 'qty_nights', values.nights, '') : '—';

const costValue = (values) => {
  const cost = Number(values.cost);
  if (values.scope === 'scope3' && (!hasValue(values.cost) || !Number.isFinite(cost) || cost === 0)) return '—';
  return hasValue(values.cost) ? `${values.currency ? `${values.currency} ` : ''}${values.cost}` : '—';
};
const reportingPeriodDateValue = (values) => {
  const raw = values.billing_period_text || values.reporting_period || values.date;
  if (!hasValue(raw)) return raw;
  return String(raw).replace(/(?:T|\s)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/, '');
};

const OCR_LEDGER_DEFAULT_WIDTHS = {
  select: 48,
  facility: 160,
  extractedItem: 270,
  reportingPeriod: 145,
  scope: 100,
  category: 200,
  subcategory: 210,
  efMethod: 120,
  quantity: 130,
  goodsTravelled: 150,
  distanceTravelled: 160,
  passengers: 110,
  daysTravelled: 130,
  rooms: 135,
  nights: 135,
  fromLocation: 170,
  toLocation: 170,
  cost: 135,
  confidence: 140,
  status: 145,
  actions: 155,
};

const ResizableColumnHeader = ({ columnKey, width, onResize, children, testId }) => {
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
    <TableHead className="relative px-2 text-center" style={{ width }} data-testid={testId}>
      {children}
      <button type="button" onPointerDown={startResize} className="absolute right-0 top-0 z-10 flex h-full w-4 touch-none items-center justify-center text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-800 cursor-col-resize" aria-label={`Resize ${columnKey} column`} title={`Resize ${columnKey} column`} data-testid={`ocr-resize-column-${columnKey}`}><GripVertical className="h-3.5 w-3.5" /></button>
    </TableHead>
  );
};

const MobileField = ({ label, value, itemId, field, wide = false, children }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm text-slate-900" data-testid={`ocr-mobile-${field}-${itemId}`}>
      {children || displayValue(value)}
    </dd>
  </div>
);

const formatSubtotal = (items) => Object.entries(items.reduce((totals, item) => {
  const values = item.current_values || {};
  const currency = values.currency || 'Unspecified currency';
  totals[currency] = (totals[currency] || 0) + (Number(values.cost) || 0);
  return totals;
}, {})).filter(([, total]) => total > 0).map(([currency, total]) => `${currency} ${total.toLocaleString()}`).join(' · ') || 'No spend total';

const RowStatus = ({ item, testIdPrefix = 'ocr-row-status' }) => {
  const values = item.current_values || {};
  const status = values.missing_values ? ['Missing data', 'bg-red-50 text-red-800 border-red-200']
    : item.needs_review ? ['Needs review', 'bg-amber-50 text-amber-900 border-amber-200']
      : ['Ready', 'bg-emerald-50 text-emerald-800 border-emerald-200'];
  return <Badge variant="outline" className={status[1]} data-testid={`${testIdPrefix}-${item.id}`}>{status[0]}</Badge>;
};

const DetailsButton = ({ item, onOpen, mobile = false }) => (
  <TooltipProvider delayDuration={100}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(event) => { event.stopPropagation(); onOpen(item); }}
          aria-label="View row details"
          data-testid={`${mobile ? 'ocr-mobile' : 'ocr'}-view-details-row-${item.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>More details</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const MoreDetailsDialog = ({ item, open, onOpenChange }) => {
  const values = item?.current_values || {};
  const extractedLocation = item?.original_values?.location || values.invoice_location || values.location;
  const details = [
    ['Accounting rationale', values.accounting_rationale || 'No accounting rationale returned.', 'accounting-rationale'],
    ['Vendor', values.vendor_name || 'Unknown vendor', 'vendor'],
    ['Invoice number', values.invoice_number, 'invoice-number'],
    ['Location', extractedLocation, 'location'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="ocr-row-details-dialog">
        <DialogHeader>
          <DialogTitle data-testid="ocr-row-details-title">Invoice activity details</DialogTitle>
          <DialogDescription data-testid="ocr-row-details-description">Additional extracted and review information for this activity row.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-slate-200 border-y border-slate-200" data-testid="ocr-row-details-list">
          {details.map(([label, value, key]) => (
            <div key={key} className="grid gap-1 px-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-xs font-semibold uppercase text-slate-500" data-testid={`ocr-row-details-${key}-label`}>{label}</dt>
              <dd className="break-words text-sm text-slate-900" data-testid={`ocr-row-details-${key}-value`}>{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
};

export const OcrReviewTable = ({ items, enabledScopes, selectedId, onSelect, onEdit, onAccept, onReject, onBulkSave, onBulkReject, acceptingId, rejectingId, bulkSaving, bulkRejecting, hideInvoiceTabs = false }) => {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [detailsItem, setDetailsItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const ledgerScrollRef = useRef(null);
  const bottomScrollbarRef = useRef(null);
  const scrollbarDragRef = useRef(null);
  const [manualColumnWidths, setManualColumnWidths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ocr-review-column-widths-v1') || '{}');
    } catch {
      return {};
    }
  });
  const [ledgerMetrics, setLedgerMetrics] = useState({ scrollWidth: 0, viewportWidth: 0, scrollLeft: 0, scrollbarWidth: 0 });
  useEffect(() => {
    if (hideInvoiceTabs) setInvoiceFilter('all');
  }, [hideInvoiceTabs]);
  const showEfMethod = items.some((item) => item.current_values?.scope === 'scope3');
  const showQuantity = items.some((item) => !isFreight(item.current_values || {}) && !isBusinessTravel(item.current_values || {}) && hasValue(item.current_values?.quantity));
  const showGoodsTravelled = items.some((item) => isFreight(item.current_values || {}) && goodsTravelledValue(item.current_values || {}) !== '—');
  const showDistanceTravelled = items.some((item) => (isFreight(item.current_values || {}) || isBusinessTravel(item.current_values || {})) && travelledDistanceValue(item.current_values || {}) !== '—');
  const showPassengers = items.some((item) => passengersValue(item.current_values || {}) !== '—');
  const showDaysTravelled = items.some((item) => daysTravelledValue(item.current_values || {}) !== '—');
  const showRooms = items.some((item) => roomsValue(item.current_values || {}) !== '—');
  const showNights = items.some((item) => nightsValue(item.current_values || {}) !== '—');
  const showFromLocation = items.some((item) => hasValue(item.current_values?.origin));
  const showToLocation = items.some((item) => hasValue(item.current_values?.destination));
  const showCost = items.some((item) => hasValue(item.current_values?.cost));
  const visibleColumnKeys = useMemo(() => [
    'select', 'facility', 'extractedItem', 'reportingPeriod', 'scope', 'category', 'subcategory',
    ...(showEfMethod ? ['efMethod'] : []),
    ...(showQuantity ? ['quantity'] : []),
    ...(showGoodsTravelled ? ['goodsTravelled'] : []),
    ...(showDistanceTravelled ? ['distanceTravelled'] : []),
    ...(showPassengers ? ['passengers'] : []),
    ...(showDaysTravelled ? ['daysTravelled'] : []),
    ...(showRooms ? ['rooms'] : []),
    ...(showNights ? ['nights'] : []),
    ...(showFromLocation ? ['fromLocation'] : []),
    ...(showToLocation ? ['toLocation'] : []),
    ...(showCost ? ['cost'] : []),
    'confidence', 'status', 'actions',
  ], [showCost, showDaysTravelled, showDistanceTravelled, showEfMethod, showFromLocation, showGoodsTravelled, showNights, showPassengers, showQuantity, showRooms, showToLocation]);
  const effectiveColumnWidths = useMemo(() => ({
    ...OCR_LEDGER_DEFAULT_WIDTHS,
    ...manualColumnWidths,
  }), [manualColumnWidths]);
  const totalColumnWidth = visibleColumnKeys.reduce((total, key) => total + effectiveColumnWidths[key], 0);
  const hasCustomizedColumnWidths = Object.keys(manualColumnWidths).length > 0;

  useEffect(() => {
    localStorage.setItem('ocr-review-column-widths-v1', JSON.stringify(manualColumnWidths));
  }, [manualColumnWidths]);

  useEffect(() => {
    const ledger = ledgerScrollRef.current;
    const bottomScrollbar = bottomScrollbarRef.current;
    if (!ledger) return undefined;
    const sync = () => setLedgerMetrics({
      scrollWidth: ledger.scrollWidth,
      viewportWidth: ledger.clientWidth,
      scrollLeft: ledger.scrollLeft,
      scrollbarWidth: bottomScrollbar?.clientWidth || ledger.clientWidth,
    });
    sync();
    ledger.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(ledger);
    if (bottomScrollbar) observer.observe(bottomScrollbar);
    return () => {
      ledger.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [items.length, totalColumnWidth]);

  const resizeColumn = (columnKey, width) => {
    const nextWidth = Math.min(480, Math.max(76, Math.round(width)));
    setManualColumnWidths((current) => {
      const next = { ...current };
      if (nextWidth === OCR_LEDGER_DEFAULT_WIDTHS[columnKey]) delete next[columnKey];
      else next[columnKey] = nextWidth;
      return next;
    });
  };
  const resetColumnWidths = () => {
    setManualColumnWidths({});
    if (ledgerScrollRef.current) ledgerScrollRef.current.scrollLeft = 0;
  };
  const maxHorizontalScroll = Math.max(0, ledgerMetrics.scrollWidth - ledgerMetrics.viewportWidth);
  const hasHorizontalOverflow = maxHorizontalScroll > 1;
  const scrollbarThumbWidth = ledgerMetrics.scrollbarWidth
    ? Math.max(40, Math.min(ledgerMetrics.scrollbarWidth, (ledgerMetrics.viewportWidth / Math.max(ledgerMetrics.scrollWidth, 1)) * ledgerMetrics.scrollbarWidth))
    : 0;
  const maxThumbTravel = Math.max(0, ledgerMetrics.scrollbarWidth - scrollbarThumbWidth);
  const scrollbarThumbLeft = maxHorizontalScroll && maxThumbTravel
    ? (ledgerMetrics.scrollLeft / maxHorizontalScroll) * maxThumbTravel
    : 0;
  const setLedgerScrollFromThumbPosition = (thumbLeft) => {
    const ledger = ledgerScrollRef.current;
    if (!ledger || !maxThumbTravel || !maxHorizontalScroll) return;
    ledger.scrollLeft = Math.max(0, Math.min(maxThumbTravel, thumbLeft)) / maxThumbTravel * maxHorizontalScroll;
  };
  const stopScrollbarDrag = () => {
    window.removeEventListener('pointermove', moveScrollbarDrag);
    window.removeEventListener('pointerup', stopScrollbarDrag);
    scrollbarDragRef.current = null;
  };
  const moveScrollbarDrag = (event) => {
    if (!scrollbarDragRef.current) return;
    setLedgerScrollFromThumbPosition(scrollbarDragRef.current.startLeft + event.clientX - scrollbarDragRef.current.startX);
  };
  const startScrollbarDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollbarDragRef.current = { startX: event.clientX, startLeft: scrollbarThumbLeft };
    window.addEventListener('pointermove', moveScrollbarDrag);
    window.addEventListener('pointerup', stopScrollbarDrag);
  };
  const handleScrollbarTrackClick = (event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setLedgerScrollFromThumbPosition(event.clientX - bounds.left - scrollbarThumbWidth / 2);
  };
  const handleLedgerWheel = (event) => {
    if (!event.deltaX) return;
    const ledger = ledgerScrollRef.current;
    if (!ledger) return;
    const nextScrollLeft = Math.max(0, Math.min(maxHorizontalScroll, ledger.scrollLeft + event.deltaX));
    if (nextScrollLeft === ledger.scrollLeft) return;
    event.preventDefault();
    ledger.scrollLeft = nextScrollLeft;
  };
  const invoiceGroups = useMemo(() => Object.values(items.reduce((groups, item) => {
    const invoice = item.current_values?.invoice_number || 'Unnumbered invoice';
    groups[invoice] = groups[invoice] || { invoice, items: [] };
    groups[invoice].items.push(item);
    return groups;
  }, {})), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const values = item.current_values || {};
    const searchable = `${values.vendor_name || ''} ${values.item_description || ''} ${values.category || ''}`.toLowerCase();
    return (invoiceFilter === 'all' || (values.invoice_number || 'Unnumbered invoice') === invoiceFilter)
      && searchable.includes(query.toLowerCase())
      && (scopeFilter === 'all' || values.scope === scopeFilter)
      && (reviewFilter === 'all' || (reviewFilter === 'review' ? item.needs_review : !item.needs_review));
  }), [items, invoiceFilter, query, scopeFilter, reviewFilter]);
  const selectableRows = filtered.filter((item) => item.status !== 'imported');
  const selectedRows = items.filter((item) => selectedIds.includes(item.id) && item.status !== 'imported');
  const selectedSavableRows = selectedRows.filter((item) => item.current_values?.scope !== 'water');
  const savableRows = items.filter((item) => item.status !== 'imported' && item.current_values?.scope !== 'water');
  const allFilteredSelected = selectableRows.length > 0 && selectableRows.every((item) => selectedIds.includes(item.id));
  const isBulkActionRunning = bulkSaving || bulkRejecting;
  const toggleRow = (itemId, checked) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, itemId])]
      : current.filter((id) => id !== itemId));
  };
  const toggleAllFiltered = (checked) => {
    const filteredIds = new Set(selectableRows.map((item) => item.id));
    setSelectedIds((current) => checked
      ? [...new Set([...current, ...filteredIds])]
      : current.filter((id) => !filteredIds.has(id)));
  };

  return (
    <section className="space-y-3" aria-labelledby="ocr-review-heading" data-testid="ocr-review-section">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ocr-review-heading" className="text-lg font-semibold text-slate-950">Review extracted activity</h2>
            {hasCustomizedColumnWidths && <Button type="button" size="sm" variant="ghost" onClick={resetColumnWidths} className="h-8 gap-1.5 text-xs text-slate-600 hover:bg-teal-50 hover:text-teal-800" data-testid="ocr-reset-column-widths-button"><RotateCcw className="h-3.5 w-3.5" />Reset widths</Button>}
          </div>
          <p className="mt-1 text-sm text-slate-600" data-testid="ocr-review-summary">
            {filtered.length} of {items.length} rows · {items.filter((item) => item.needs_review).length} need attention
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-[14rem] flex-1 sm:flex-none sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rows" className="pl-9" data-testid="ocr-review-search-input" />
          </div>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger data-testid="ocr-scope-filter"><SelectValue placeholder="All scopes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="ocr-scope-filter-all">All scopes</SelectItem>
              {enabledScopes.map((scope) => <SelectItem key={scope} value={scope} data-testid={`ocr-scope-filter-${scope}`}>{scope.replace('scope', 'Scope ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={reviewFilter} onValueChange={setReviewFilter}>
            <SelectTrigger data-testid="ocr-review-filter"><SelectValue placeholder="All rows" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="ocr-review-filter-all">All rows</SelectItem>
              <SelectItem value="review" data-testid="ocr-review-filter-needs-review">Needs review</SelectItem>
              <SelectItem value="ready" data-testid="ocr-review-filter-ready">Ready</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2" data-testid="ocr-bulk-action-buttons">
            {selectedRows.length > 0 && <span className="text-sm text-slate-600" data-testid="ocr-selected-row-count">{selectedRows.length} selected</span>}
            {selectedRows.length > 0 && <>
              <Button type="button" size="sm" variant="outline" onClick={() => onBulkSave(selectedSavableRows)} disabled={!selectedSavableRows.length || isBulkActionRunning} data-testid="ocr-save-selected-button"><Check className="mr-2 h-4 w-4" />Save selected</Button>
              <Button type="button" size="sm" variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onBulkReject(selectedRows)} disabled={isBulkActionRunning} data-testid="ocr-reject-selected-button"><XCircle className="mr-2 h-4 w-4" />Reject selected</Button>
            </>}
            <Button type="button" size="sm" onClick={() => onBulkSave(savableRows)} disabled={!savableRows.length || isBulkActionRunning} data-testid="ocr-save-all-button"><Check className="mr-2 h-4 w-4" />Save all</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => onBulkReject(items.filter((item) => item.status !== 'imported'))} disabled={!selectableRows.length || isBulkActionRunning} data-testid="ocr-reject-all-button"><XCircle className="mr-2 h-4 w-4" />Reject all</Button>
          </div>
        </div>
      </div>

      {!hideInvoiceTabs && invoiceGroups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Invoices in this source document" data-testid="ocr-invoice-tabs">
          <button type="button" role="tab" aria-selected={invoiceFilter === 'all'} onClick={() => setInvoiceFilter('all')} className={`shrink-0 border px-3 py-2 text-left text-xs transition-colors ${invoiceFilter === 'all' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-testid="ocr-invoice-tab-all">All invoices · {items.length} rows</button>
          {invoiceGroups.map((group) => (
            <button key={group.invoice} type="button" role="tab" aria-selected={invoiceFilter === group.invoice} onClick={() => setInvoiceFilter(group.invoice)} className={`shrink-0 border px-3 py-2 text-left text-xs transition-colors ${invoiceFilter === group.invoice ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-testid={`ocr-invoice-tab-${group.invoice}`}>
              <span className="block font-semibold">{group.invoice}</span><span className="mt-0.5 block">{group.items.length} rows · {formatSubtotal(group.items)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="hidden overflow-hidden border border-slate-200 bg-white lg:block" data-testid="ocr-review-desktop-table">
        <div ref={ledgerScrollRef} onWheel={handleLedgerWheel} className="overflow-x-auto" data-testid="ocr-review-ledger-scroll-region">
        <Table className="table-fixed" style={{ width: Math.max(totalColumnWidth, ledgerMetrics.viewportWidth) }}>
          <colgroup>{visibleColumnKeys.map((columnKey) => <col key={columnKey} style={{ width: effectiveColumnWidths[columnKey] }} />)}</colgroup>
          <TableHeader className="bg-slate-50 [&_th]:text-center">
            <TableRow>
              <ResizableColumnHeader columnKey="select" width={effectiveColumnWidths.select} onResize={resizeColumn} testId="ocr-ledger-header-select"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} disabled={!selectableRows.length || isBulkActionRunning} aria-label="Select all visible rows" data-testid="ocr-desktop-select-all-checkbox" /></ResizableColumnHeader>
              <ResizableColumnHeader columnKey="facility" width={effectiveColumnWidths.facility} onResize={resizeColumn} testId="ocr-ledger-header-facility">Facility</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="extractedItem" width={effectiveColumnWidths.extractedItem} onResize={resizeColumn} testId="ocr-ledger-header-extracted-item">Extracted item</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="reportingPeriod" width={effectiveColumnWidths.reportingPeriod} onResize={resizeColumn} testId="ocr-ledger-header-reporting-period-date">Reporting period</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="scope" width={effectiveColumnWidths.scope} onResize={resizeColumn} testId="ocr-ledger-header-scope">Scope</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="category" width={effectiveColumnWidths.category} onResize={resizeColumn} testId="ocr-ledger-header-category">Category</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="subcategory" width={effectiveColumnWidths.subcategory} onResize={resizeColumn} testId="ocr-ledger-header-subcategory">Subcategory</ResizableColumnHeader>
              {showEfMethod && <ResizableColumnHeader columnKey="efMethod" width={effectiveColumnWidths.efMethod} onResize={resizeColumn} testId="ocr-ledger-header-ef-method">EF method</ResizableColumnHeader>}
              {showQuantity && <ResizableColumnHeader columnKey="quantity" width={effectiveColumnWidths.quantity} onResize={resizeColumn} testId="ocr-ledger-header-quantity">Quantity</ResizableColumnHeader>}
              {showGoodsTravelled && <ResizableColumnHeader columnKey="goodsTravelled" width={effectiveColumnWidths.goodsTravelled} onResize={resizeColumn} testId="ocr-ledger-header-goods-travelled">Goods travelled</ResizableColumnHeader>}
              {showDistanceTravelled && <ResizableColumnHeader columnKey="distanceTravelled" width={effectiveColumnWidths.distanceTravelled} onResize={resizeColumn} testId="ocr-ledger-header-distance-travelled">Distance travelled</ResizableColumnHeader>}
              {showPassengers && <ResizableColumnHeader columnKey="passengers" width={effectiveColumnWidths.passengers} onResize={resizeColumn} testId="ocr-ledger-header-passengers">Passengers</ResizableColumnHeader>}
              {showDaysTravelled && <ResizableColumnHeader columnKey="daysTravelled" width={effectiveColumnWidths.daysTravelled} onResize={resizeColumn} testId="ocr-ledger-header-days-travelled">Days travelled</ResizableColumnHeader>}
              {showRooms && <ResizableColumnHeader columnKey="rooms" width={effectiveColumnWidths.rooms} onResize={resizeColumn} testId="ocr-ledger-header-rooms">Number of rooms</ResizableColumnHeader>}
              {showNights && <ResizableColumnHeader columnKey="nights" width={effectiveColumnWidths.nights} onResize={resizeColumn} testId="ocr-ledger-header-nights">Number of nights</ResizableColumnHeader>}
              {showFromLocation && <ResizableColumnHeader columnKey="fromLocation" width={effectiveColumnWidths.fromLocation} onResize={resizeColumn} testId="ocr-ledger-header-from-location">From location</ResizableColumnHeader>}
              {showToLocation && <ResizableColumnHeader columnKey="toLocation" width={effectiveColumnWidths.toLocation} onResize={resizeColumn} testId="ocr-ledger-header-to-location">To location</ResizableColumnHeader>}
              {showCost && <ResizableColumnHeader columnKey="cost" width={effectiveColumnWidths.cost} onResize={resizeColumn} testId="ocr-ledger-header-cost">Cost</ResizableColumnHeader>}
              <ResizableColumnHeader columnKey="confidence" width={effectiveColumnWidths.confidence} onResize={resizeColumn} testId="ocr-ledger-header-confidence">Confidence score</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="status" width={effectiveColumnWidths.status} onResize={resizeColumn} testId="ocr-ledger-header-status">Review status</ResizableColumnHeader>
              <ResizableColumnHeader columnKey="actions" width={effectiveColumnWidths.actions} onResize={resizeColumn} testId="ocr-ledger-header-actions">Actions</ResizableColumnHeader>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:text-center">
            {filtered.map((item) => {
              const values = item.current_values || {};
              return (
                <TableRow key={item.id} className={selectedId === item.id ? 'bg-emerald-50/60' : ''} onClick={() => onSelect(item)} data-testid={`ocr-review-row-${item.id}`}>
                  <TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => toggleRow(item.id, checked === true)} disabled={item.status === 'imported' || isBulkActionRunning} aria-label={`Select ${values.item_description || 'OCR row'}`} data-testid={`ocr-select-row-${item.id}-checkbox`} /></TableCell>
                  <TableCell className="max-w-48 whitespace-normal break-words" data-testid={`ocr-row-facility-${item.id}`}>{displayValue(values.location)}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal break-words" data-testid={`ocr-row-description-${item.id}`}>
                    <p>{values.item_description || values.fuel_name || 'Unspecified activity'}</p>
                    {(values.low_confidence_fields || []).length > 0 && <p className="mt-1 text-xs text-amber-800" data-testid={`ocr-row-review-reasons-${item.id}`}>Review: {values.low_confidence_fields.join(', ')}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`ocr-row-reporting-period-date-${item.id}`}>{displayValue(reportingPeriodDateValue(values))}</TableCell>
                  <TableCell><Badge variant="outline" className={scopeTone[values.scope]} data-testid={`ocr-row-scope-${item.id}`}>{values.scope?.replace('scope', 'Scope ') || '—'}</Badge></TableCell>
                  <TableCell className="max-w-60 whitespace-normal break-words" data-testid={`ocr-row-category-${item.id}`}>{values.category || 'Unknown'}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal break-words" data-testid={`ocr-row-subcategory-${item.id}`}>{displayValue(values.subcategory || values.sector || values.naics_label)}</TableCell>
                  {showEfMethod && <TableCell><span className="text-xs font-medium uppercase text-slate-600" data-testid={`ocr-row-method-${item.id}`}>{values.scope === 'scope3' ? values.ef_method || 'Review' : '—'}</span></TableCell>}
                  {showQuantity && <TableCell className="whitespace-normal" data-testid={`ocr-row-quantity-${item.id}`}>{isFreight(values) || isBusinessTravel(values) ? '—' : quantityValue(values)}</TableCell>}
                  {showGoodsTravelled && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-goods-travelled-${item.id}`}>{isFreight(values) ? goodsTravelledValue(values) : '—'}</TableCell>}
                  {showDistanceTravelled && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-distance-travelled-${item.id}`}>{(isFreight(values) || isBusinessTravel(values)) ? travelledDistanceValue(values) : '—'}</TableCell>}
                  {showPassengers && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-passengers-${item.id}`}>{passengersValue(values)}</TableCell>}
                  {showDaysTravelled && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-days-travelled-${item.id}`}>{daysTravelledValue(values)}</TableCell>}
                  {showRooms && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-rooms-${item.id}`}>{roomsValue(values)}</TableCell>}
                  {showNights && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-nights-${item.id}`}>{nightsValue(values)}</TableCell>}
                  {showFromLocation && <TableCell className="whitespace-normal" data-testid={`ocr-row-from-location-${item.id}`}>{displayValue(values.origin)}</TableCell>}
                  {showToLocation && <TableCell className="whitespace-normal" data-testid={`ocr-row-to-location-${item.id}`}>{displayValue(values.destination)}</TableCell>}
                  {showCost && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-cost-${item.id}`}>{costValue(values)}</TableCell>}
                  <TableCell><Confidence value={item.confidence_score ?? values.confidence_score} itemId={item.id} /></TableCell>
                  <TableCell><RowStatus item={item} /></TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <DetailsButton item={item} onOpen={setDetailsItem} />
                      <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); onEdit(item); }} aria-label="Edit row" data-testid={`ocr-edit-row-${item.id}`}><Edit3 className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={(event) => { event.stopPropagation(); onReject(item); }} disabled={rejectingId === item.id || isBulkActionRunning} aria-label="Reject row" data-testid={`ocr-reject-row-${item.id}`}><XCircle className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" onClick={(event) => { event.stopPropagation(); onAccept(item); }} disabled={acceptingId === item.id || item.status === 'imported' || isBulkActionRunning} aria-label="Calculate and save GHG entry" title="Save GHG" data-testid={`ocr-save-ghg-row-${item.id}`}><Check className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        {hasHorizontalOverflow && <div className="border-t border-stone-200 bg-stone-50 px-4 py-1" data-testid="ocr-review-ledger-bottom-scrollbar">
          <div ref={bottomScrollbarRef} className="relative h-2 w-full rounded-full bg-stone-200" onPointerDown={handleScrollbarTrackClick} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setLedgerScrollFromThumbPosition(scrollbarThumbLeft - 80); if (event.key === 'ArrowRight') setLedgerScrollFromThumbPosition(scrollbarThumbLeft + 80); }} role="scrollbar" tabIndex={0} aria-label="Scroll OCR ledger columns horizontally" aria-valuemin={0} aria-valuemax={maxHorizontalScroll} aria-valuenow={Math.round(ledgerMetrics.scrollLeft)} data-testid="ocr-review-ledger-bottom-scrollbar-track">
            <button type="button" onPointerDown={startScrollbarDrag} className="absolute top-0 h-2 rounded-full bg-slate-400 transition-colors hover:bg-slate-500 active:bg-slate-600" style={{ width: scrollbarThumbWidth, transform: `translateX(${scrollbarThumbLeft}px)` }} aria-label="Drag to scroll OCR ledger columns horizontally" data-testid="ocr-review-ledger-bottom-scrollbar-thumb" />
          </div>
        </div>}
      </div>

      <div className="grid gap-2 lg:hidden" data-testid="ocr-review-mobile-list">
        {filtered.map((item) => {
          const values = item.current_values || {};
          return (
            <article key={item.id} className={`border bg-white p-4 ${selectedId === item.id ? 'border-emerald-600' : 'border-slate-200'}`} data-testid={`ocr-review-card-${item.id}`}>
              <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => toggleRow(item.id, checked === true)} disabled={item.status === 'imported' || isBulkActionRunning} aria-label={`Select ${values.item_description || 'OCR row'}`} data-testid={`ocr-mobile-select-row-${item.id}-checkbox`} />
                <span className="text-xs font-medium text-slate-600" data-testid={`ocr-mobile-select-row-${item.id}-label`}>Select this row</span>
              </div>
              <button type="button" onClick={() => onSelect(item)} className="flex w-full items-center justify-between gap-3 text-left" data-testid={`ocr-mobile-select-row-${item.id}`}>
                <span className="text-sm font-semibold text-slate-950">Review extracted row</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <MobileField label="Facility" value={values.location} itemId={item.id} field="facility" />
                <MobileField label="Extracted item" value={values.item_description || values.fuel_name || 'Unspecified activity'} itemId={item.id} field="description" wide />
                <MobileField label="Reporting period" value={reportingPeriodDateValue(values)} itemId={item.id} field="reporting-period-date" />
                <MobileField label="Scope" itemId={item.id} field="scope"><Badge variant="outline" className={scopeTone[values.scope]}>{values.scope?.replace('scope', 'Scope ') || '—'}</Badge></MobileField>
                <MobileField label="Category" value={values.category || 'Unknown'} itemId={item.id} field="category" wide />
                <MobileField label="Subcategory / sector" value={values.subcategory || values.sector || values.naics_label} itemId={item.id} field="subcategory" wide />
                {showEfMethod && <MobileField label="EF method" value={values.scope === 'scope3' ? values.ef_method || 'Review' : '—'} itemId={item.id} field="method" />}
                {showQuantity && <MobileField label="Quantity" value={isFreight(values) || isBusinessTravel(values) ? '—' : quantityValue(values)} itemId={item.id} field="quantity" />}
                {showGoodsTravelled && <MobileField label="Goods travelled" value={isFreight(values) ? goodsTravelledValue(values) : '—'} itemId={item.id} field="goods-travelled" />}
                {showDistanceTravelled && <MobileField label="Distance travelled" value={(isFreight(values) || isBusinessTravel(values)) ? travelledDistanceValue(values) : '—'} itemId={item.id} field="distance-travelled" />}
                {showPassengers && <MobileField label="Passengers" value={passengersValue(values)} itemId={item.id} field="passengers" />}
                {showDaysTravelled && <MobileField label="Days travelled" value={daysTravelledValue(values)} itemId={item.id} field="days-travelled" />}
                {showRooms && <MobileField label="Number of rooms" value={roomsValue(values)} itemId={item.id} field="rooms" />}
                {showNights && <MobileField label="Number of nights" value={nightsValue(values)} itemId={item.id} field="nights" />}
                {showFromLocation && <MobileField label="From location" value={values.origin} itemId={item.id} field="from-location" />}
                {showToLocation && <MobileField label="To location" value={values.destination} itemId={item.id} field="to-location" />}
                {showCost && <MobileField label="Cost" value={costValue(values)} itemId={item.id} field="cost" />}
                <MobileField label="Confidence score" value={confidenceLabel(item.confidence_score ?? values.confidence_score)} itemId={item.id} field="confidence" />
                <MobileField label="Review status" itemId={item.id} field="review-status" wide><RowStatus item={item} testIdPrefix="ocr-mobile-row-status" /></MobileField>
              </dl>
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4" data-testid={`ocr-mobile-actions-${item.id}`}>
                <DetailsButton item={item} onOpen={setDetailsItem} mobile />
                <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(item)} aria-label="Edit row" data-testid={`ocr-mobile-edit-row-${item.id}`}><Edit3 className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onReject(item)} disabled={rejectingId === item.id || isBulkActionRunning} aria-label="Reject row" data-testid={`ocr-mobile-reject-row-${item.id}`}><XCircle className="h-4 w-4" /></Button>
                <Button type="button" size="icon" onClick={() => onAccept(item)} disabled={acceptingId === item.id || item.status === 'imported' || isBulkActionRunning} aria-label="Calculate and save GHG entry" title="Save GHG" data-testid={`ocr-mobile-save-ghg-row-${item.id}`}><Check className="h-4 w-4" /></Button>
              </div>
            </article>
          );
        })}
      </div>
      <MoreDetailsDialog item={detailsItem} open={Boolean(detailsItem)} onOpenChange={(open) => { if (!open) setDetailsItem(null); }} />
    </section>
  );
};
